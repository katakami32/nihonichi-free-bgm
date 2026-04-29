/**
 * 日本一フリーBGM — Cloudflare Workers API
 *
 *  ── パブリック API ──────────────────────────────────────────────────
 *  - GET  /api/genres                ジャンル一覧 + 件数
 *  - GET  /api/songs                 一覧 (genre, bpm, dur, mood, sort, page, limit)
 *  - GET  /api/search                全文検索 (q, page, limit)
 *  - GET  /api/song/:slug            詳細 1 件
 *  - GET  /api/popular               人気順 (KV キャッシュ)
 *  - POST /api/play       { id }     再生カウント +1
 *  - POST /api/download   { id }     DL カウント +1
 *  - GET  /api/stats                 全体統計
 *
 *  ── R2 プロキシ（キャッシュヘッダーを明示制御） ────────────────────
 *  - GET  /r2/audio/*                音楽ファイル  Cache-Control: 1年 immutable
 *  - GET  /r2/data/*                 データ JSON   Cache-Control: no-cache
 *
 *  ── 管理 API（Bearer 認証必須） ────────────────────────────────────
 *  - POST   /api/admin/songs         追加
 *  - PATCH  /api/admin/songs/:id     更新
 *  - DELETE /api/admin/songs/:id     削除
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';

type Env = {
  DB: D1Database;
  KV: KVNamespace;
  R2: R2Bucket;            // bgm-data バケット（wrangler.toml [[r2_buckets]]）
  R2_PUBLIC_BASE: string;
  ALLOWED_ORIGIN: string;
  ADMIN_TOKEN: string;
};

const app = new Hono<{ Bindings: Env }>();

// ─── CORS ─────────────────────────────────────────────────────────
app.use('*', (c, next) =>
  cors({
    origin: c.env.ALLOWED_ORIGIN || '*',
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })(c, next),
);

// ─── helpers ──────────────────────────────────────────────────────
const toUrl = (base: string, key?: string | null) => {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;        // 既に絶対URL
  if (!base) return key;                           // base 未設定 → 相対パスのまま返す
  return `${base.replace(/\/$/, '')}/${key.replace(/^\//, '')}`;
};

type Row = Record<string, any>;

const mapRow = (base: string) => (r: Row) => ({
  id: r.id,
  slug: r.slug,
  title: r.title,
  genre: r.genre,
  description: r.description,
  tags: r.tags,
  duration: r.duration,
  bpm: r.bpm,
  bpm_bucket: r.bpm_bucket,
  dur_bucket: r.dur_bucket,
  audio_url: toUrl(base, r.audio_key),
  image_url: toUrl(base, r.image_key),
  created_at: r.created_at,
  download_count: r.download_count,
  play_count: r.play_count,
});

// FTS5 trigram は 3文字未満だと動かないので普通の LIKE にフォールバック
const buildSearchSql = (q: string) => {
  if (q.length >= 3) {
    return {
      sql: `SELECT s.* FROM songs_fts f
            JOIN songs s ON s.rowid = f.rowid
            WHERE songs_fts MATCH ?
            ORDER BY rank
            LIMIT ? OFFSET ?`,
      // FTS5 は特殊文字をエスケープした方が安全。クォートで囲む。
      bind: (limit: number, offset: number) => [`"${q.replace(/"/g, '""')}"`, limit, offset],
    };
  }
  // 短いクエリは LIKE
  const like = `%${q}%`;
  return {
    sql: `SELECT * FROM songs
          WHERE title LIKE ? OR description LIKE ? OR tags LIKE ? OR genre LIKE ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?`,
    bind: (limit: number, offset: number) => [like, like, like, like, limit, offset],
  };
};

const ORDER_BY: Record<string, string> = {
  new: 'created_at DESC',
  'bpm-asc': 'CASE WHEN bpm IS NULL THEN 1 ELSE 0 END, bpm ASC',
  'bpm-desc': 'CASE WHEN bpm IS NULL THEN 1 ELSE 0 END, bpm DESC',
  'dur-asc': 'CASE WHEN duration IS NULL THEN 1 ELSE 0 END, duration ASC',
  'dur-desc': 'CASE WHEN duration IS NULL THEN 1 ELSE 0 END, duration DESC',
  popular: 'download_count DESC, play_count DESC',
  title: 'title COLLATE NOCASE',
};

// mood → tag/description LIKE 候補
const MOOD_TERMS: Record<string, string[]> = {
  chill: ['chill', 'lo-fi', 'lofi', 'cafe', 'relax', 'ambient', 'calm', 'soft', 'warm', 'cozy', 'sleep', 'soothing', 'healing', 'gentle'],
  upbeat: ['upbeat', 'happy', 'bright', 'cheerful', 'fun', 'energetic', 'sunny', 'playful', 'optimistic'],
  dark: ['dark', 'tense', 'horror', 'suspense', 'gritty', 'aggressive', 'intense', 'battle', 'dramatic'],
  epic: ['epic', 'cinematic', 'orchestral', 'grand', 'heroic', 'trailer', 'majestic', 'adventure'],
  cute: ['cute', 'kawaii', 'children', 'kids', 'toy', 'sweet', 'whimsical'],
  cool: ['cool', 'jazz', 'funk', 'swing', 'sophisticated', 'smooth', 'noir', 'retro', 'synthwave', 'urban'],
};

// ─── R2 プロキシ ──────────────────────────────────────────────────
// /r2/audio/* → R2 の audio/ プレフィックス — 長期キャッシュ (1年 immutable)
// /r2/data/*  → R2 の data/  プレフィックス — キャッシュなし (常に最新)

app.get('/r2/audio/*', async (c) => {
  if (!c.env.R2) return c.json({ error: 'R2 not configured' }, 503);
  const url = new URL(c.req.url);
  const r2Key = 'audio/' + url.pathname.replace(/^\/r2\/audio\/?/, '');
  if (!r2Key || r2Key === 'audio/') return c.json({ error: 'key required' }, 400);

  const obj = await c.env.R2.get(r2Key);
  if (!obj) return c.json({ error: 'not found' }, 404);

  const headers = new Headers();
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Content-Type', (obj as R2ObjectBody).httpMetadata?.contentType || 'audio/mpeg');
  const etag = (obj as R2ObjectBody).httpEtag;
  if (etag) headers.set('ETag', etag);

  return new Response((obj as R2ObjectBody).body, { headers });
});

// /r2/data/* → JSONデータ — no-cache（デプロイ後に即最新が届く）
app.get('/r2/data/*', async (c) => {
  if (!c.env.R2) return c.json({ error: 'R2 not configured' }, 503);
  const url = new URL(c.req.url);
  const r2Key = 'data/' + url.pathname.replace(/^\/r2\/data\/?/, '');
  if (!r2Key || r2Key === 'data/') return c.json({ error: 'key required' }, 400);

  const obj = await c.env.R2.get(r2Key);
  if (!obj) return c.json({ error: 'not found' }, 404);

  const headers = new Headers();
  headers.set('Cache-Control', 'no-cache, must-revalidate');
  headers.set('Content-Type', 'application/json; charset=utf-8');

  return new Response((obj as R2ObjectBody).body, { headers });
});

// ─── public endpoints ─────────────────────────────────────────────

app.get('/api/genres', async (c) => {
  const cacheKey = new Request(new URL(c.req.url).origin + '/cache/genres');
  const cached = await caches.default.match(cacheKey);
  if (cached) return cached;

  const { results } = await c.env.DB.prepare(
    `SELECT g.slug, g.label_ja, g.label_en, g.cover, g.sort_order,
            COUNT(s.id) AS count
     FROM genres g
     LEFT JOIN songs s ON s.genre = g.slug
     GROUP BY g.slug
     ORDER BY g.sort_order, count DESC`,
  ).all();

  const res = c.json(results, 200, {
    'Cache-Control': 'public, max-age=300, s-maxage=3600',
  });
  c.executionCtx.waitUntil(caches.default.put(cacheKey, res.clone()));
  return res;
});

app.get('/api/songs', async (c) => {
  const url = new URL(c.req.url);
  const genre = url.searchParams.get('genre');
  const bpm = url.searchParams.get('bpm');
  const dur = url.searchParams.get('dur');
  const mood = url.searchParams.get('mood');
  const sort = url.searchParams.get('sort') || 'new';
  const page = Math.max(1, +(url.searchParams.get('page') || 1));
  const limit = Math.min(100, +(url.searchParams.get('limit') || 24));
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: any[] = [];

  if (genre && genre !== 'all') { where.push('genre = ?'); params.push(genre); }
  if (bpm) { where.push('bpm_bucket = ?'); params.push(bpm); }
  if (dur) { where.push('dur_bucket = ?'); params.push(dur); }

  if (mood && MOOD_TERMS[mood]) {
    const terms = MOOD_TERMS[mood];
    const ors = terms.map(() => '(LOWER(tags) LIKE ? OR LOWER(description) LIKE ? OR LOWER(genre) LIKE ?)').join(' OR ');
    where.push(`(${ors})`);
    for (const t of terms) {
      const like = `%${t}%`;
      params.push(like, like, like);
    }
  }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const order = ORDER_BY[sort] || ORDER_BY.new;

  const [rows, total] = await Promise.all([
    c.env.DB.prepare(
      `SELECT * FROM songs ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
    ).bind(...params, limit, offset).all<Row>(),
    c.env.DB.prepare(`SELECT COUNT(*) AS c FROM songs ${whereSql}`).bind(...params).first<{ c: number }>(),
  ]);

  return c.json(
    {
      page,
      limit,
      total: total?.c ?? 0,
      items: (rows.results || []).map(mapRow(c.env.R2_PUBLIC_BASE)),
    },
    200,
    { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
  );
});

app.get('/api/search', async (c) => {
  const q = (c.req.query('q') || '').trim();
  if (!q) return c.json({ items: [], total: 0, page: 1, limit: 24 });

  const page = Math.max(1, +(c.req.query('page') || 1));
  const limit = Math.min(50, +(c.req.query('limit') || 24));

  const { sql, bind } = buildSearchSql(q);
  const stmt = c.env.DB.prepare(sql).bind(...bind(limit, (page - 1) * limit));

  let results: Row[] = [];
  try {
    const r = await stmt.all<Row>();
    results = r.results || [];
  } catch (e) {
    // FTS構文エラー → LIKEフォールバック
    const like = `%${q}%`;
    const r = await c.env.DB.prepare(
      `SELECT * FROM songs WHERE title LIKE ? OR description LIKE ? OR tags LIKE ?
       ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ).bind(like, like, like, limit, (page - 1) * limit).all<Row>();
    results = r.results || [];
  }

  return c.json(
    {
      page,
      limit,
      q,
      items: results.map(mapRow(c.env.R2_PUBLIC_BASE)),
    },
    200,
    { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
  );
});

app.get('/api/song/:slug', async (c) => {
  const slug = c.req.param('slug');
  const r = await c.env.DB.prepare(`SELECT * FROM songs WHERE slug = ?`).bind(slug).first<Row>();
  if (!r) return c.json({ error: 'not found' }, 404);
  return c.json(mapRow(c.env.R2_PUBLIC_BASE)(r), 200, {
    'Cache-Control': 'public, max-age=300, s-maxage=3600',
  });
});

app.get('/api/popular', async (c) => {
  const cached = await c.env.KV.get('popular:30', 'json');
  if (cached) return c.json(cached);

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM songs
     ORDER BY download_count DESC, play_count DESC
     LIMIT 30`,
  ).all<Row>();

  const data = (results || []).map(mapRow(c.env.R2_PUBLIC_BASE));
  c.executionCtx.waitUntil(
    c.env.KV.put('popular:30', JSON.stringify(data), { expirationTtl: 600 }),
  );
  return c.json(data);
});

app.get('/api/stats', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT COUNT(*) AS songs,
            SUM(duration) AS total_duration,
            SUM(download_count) AS downloads,
            SUM(play_count) AS plays
     FROM songs`,
  ).first<Row>();
  const g = await c.env.DB.prepare(`SELECT COUNT(*) AS c FROM genres`).first<{ c: number }>();
  return c.json({
    songs: r?.songs ?? 0,
    genres: g?.c ?? 0,
    total_duration_sec: r?.total_duration ?? 0,
    downloads: r?.downloads ?? 0,
    plays: r?.plays ?? 0,
  });
});

// ─── counters ─────────────────────────────────────────────────────
app.post('/api/play', async (c) => {
  const { id } = await c.req.json<{ id: string }>().catch(() => ({ id: '' }));
  if (!id) return c.json({ error: 'id required' }, 400);
  c.executionCtx.waitUntil(
    c.env.DB.prepare(`UPDATE songs SET play_count = play_count + 1 WHERE id = ?`).bind(id).run(),
  );
  return c.json({ ok: true });
});

app.post('/api/download', async (c) => {
  const { id } = await c.req.json<{ id: string }>().catch(() => ({ id: '' }));
  if (!id) return c.json({ error: 'id required' }, 400);
  c.executionCtx.waitUntil(
    c.env.DB.prepare(`UPDATE songs SET download_count = download_count + 1 WHERE id = ?`).bind(id).run(),
  );
  return c.json({ ok: true });
});

// ─── admin ────────────────────────────────────────────────────────
const admin = new Hono<{ Bindings: Env }>();
admin.use('*', (c, next) => bearerAuth({ token: c.env.ADMIN_TOKEN })(c, next));

const ADMIN_FIELDS = [
  'slug', 'title', 'genre', 'description', 'tags',
  'duration', 'bpm', 'model', 'audio_key', 'image_key', 'created_at',
] as const;

admin.post('/songs', async (c) => {
  const b = await c.req.json<Row>();
  const id = b.id || crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO songs (id,slug,title,genre,description,tags,duration,bpm,model,audio_key,image_key,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(
    id, b.slug, b.title, b.genre, b.description ?? null, b.tags ?? null,
    b.duration ?? null, b.bpm ?? null, b.model ?? null,
    b.audio_key, b.image_key ?? null, b.created_at || new Date().toISOString(),
  ).run();
  return c.json({ ok: true, id });
});

admin.patch('/songs/:id', async (c) => {
  const id = c.req.param('id');
  const b = (await c.req.json<Row>()) || {};
  const fields = (Object.keys(b) as string[]).filter((k) =>
    (ADMIN_FIELDS as readonly string[]).includes(k),
  );
  if (!fields.length) return c.json({ error: 'no allowed fields' }, 400);
  const set = fields.map((f) => `${f} = ?`).join(', ');
  await c.env.DB.prepare(`UPDATE songs SET ${set} WHERE id = ?`)
    .bind(...fields.map((f) => b[f]), id).run();
  return c.json({ ok: true });
});

admin.delete('/songs/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM songs WHERE id = ?`).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

app.route('/api/admin', admin);

// ─── root ─────────────────────────────────────────────────────────
app.get('/', (c) =>
  c.json({
    name: '日本一フリーBGM API',
    endpoints: [
      'GET /api/genres',
      'GET /api/songs?genre=&bpm=&dur=&mood=&sort=&page=&limit=',
      'GET /api/search?q=&page=&limit=',
      'GET /api/song/:slug',
      'GET /api/popular',
      'GET /api/stats',
      'POST /api/play {id}',
      'POST /api/download {id}',
    ],
  }),
);

app.notFound((c) => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || 'server error' }, 500);
});

export default app;
