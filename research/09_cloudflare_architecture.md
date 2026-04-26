# Cloudflare無料枠で2万曲BGMサイトを動かす構成案

> 2026-04-25 / Pages + Workers + D1 + R2 を組み合わせて、月額ほぼゼロで日本一規模のサイトを支えるための設計書。

---

## 1. TL;DR

| 層 | 採用技術 | 役割 | 無料枠の中で収まる？ |
|---|---|---|---|
| 配信(Frontend) | **Cloudflare Pages** | HTML/CSS/JS の配信 + ジャンル別の静的ページ事前生成 | ◎ 帯域・リクエスト無制限 |
| API | **Cloudflare Workers** | 検索・一覧・詳細・お気に入り集計など | △ 100K req/day。Cache APIで実req数を1/10〜1/100に圧縮できる |
| メタDB | **Cloudflare D1** (SQLite + FTS5) | 2万曲の検索可能メタデータ | ◎ 5GB / 5M reads-day で余裕 |
| キャッシュ | **Workers Cache API + KV** | 検索結果キャッシュ・人気ランキング | ◎ |
| 音声ファイル | **R2** または外部互換(B2+Bunny CDN, Wasabi 等) | mp3 (2万曲 ≈ 20-40GB) | △ R2は10GB無料、超過分は$0.015/GB ⇒ 40GBでも$0.45/月 |
| 画像 | **R2** | カバー画像 (2万件 ≈ 1GB) | ◎ 10GB枠内 |
| ビルド/CI | **GitHub Actions + Wrangler** | Pages/Workers/D1 を一発デプロイ | ◎ |

> R2は **エグレス(下り転送)が完全無料** が最大の武器。S3だと月数千円かかるトラフィックがゼロ円。

---

## 2. アーキテクチャ図

```
                                ┌──────────────────────────────┐
                                │       ユーザー (ブラウザ)       │
                                └────┬───────────────┬─────────┘
                                     │ HTML/CSS/JS    │ MP3 / JPEG
                                     ▼                ▼
                       ┌──────────────────────┐  ┌───────────────────┐
                       │ Cloudflare Pages     │  │  R2 (public bucket)│
                       │  /                   │  │  audio/<genre>/*.mp3│
                       │  /genre/<slug>/      │  │  images/<genre>/*.jpg│
                       │  /songs/<slug>/      │  │  cdn.example.com   │
                       │  ※ 静的事前生成        │  └───────────────────┘
                       └──────────┬───────────┘
                                  │ fetch /api/...
                                  ▼
                       ┌──────────────────────┐
                       │ Cloudflare Workers   │
                       │ api.example.com      │
                       │  GET /api/songs       │
                       │  GET /api/search      │
                       │  GET /api/song/:id    │
                       │  GET /api/popular     │
                       │  POST /api/admin/*    │←─ Bearer Token (管理者のみ)
                       └────┬──────┬──────────┘
                            │      │
                  ┌─────────▼┐  ┌──▼───────────┐
                  │ D1 (SQL) │  │ KV / Cache API│
                  │ songs    │  │ - search:<key>│
                  │ genres   │  │ - popular     │
                  │ tags FTS5│  │ - settings    │
                  └──────────┘  └───────────────┘

                       ┌──────────────────────┐
                       │ 管理画面 (Pages 別途)  │
                       │ admin.example.com    │  ← Cloudflare Access で IP/メール制限
                       │ メタ編集・新曲アップ    │
                       └──────────────────────┘
```

---

## 3. 無料枠の試算（2万曲・月間100万PV想定）

| サービス | 制限(無料) | 試算 | 余裕 |
|---|---|---|---|
| Pages リクエスト | 無制限 | 100万PV × 5静的 = 500万 | ◎ |
| Pages 帯域 | 無制限 | — | ◎ |
| Workers req | **100,000/日** | 100万PV × 3API = 300万/月 ≈ 100K/日 | ⚠️ ギリギリ。Cache API で **実 invocation を 1/5〜1/20** に減らせば余裕 |
| Workers CPU | 10ms/req (無料) | SQLは1〜3ms。OK | ◎ |
| D1 reads | 500万/日 | 100K req/日 × 1〜2 read = 20万/日 | ◎ |
| D1 writes | 10万/日 | 管理画面のみ。1日数百 | ◎ |
| D1 storage | 5GB | 2万行 ≈ 30MB | ◎ |
| KV reads | 100K/日 | 設定読み込み等。少 | ◎ |
| KV writes | 1K/日 | 人気ランキング更新 1日数十 | ◎ |
| R2 storage | 10GB | 画像1GB + 音声(ビットレート次第) 12〜40GB | △ 音声を128kbps化なら約 20GB ≈ $0.15/月、超過は微々たる金額 |
| R2 Class A op | 100万/月 | 管理アップロード時のみ | ◎ |
| R2 Class B op | 1000万/月 | 各DLが1op ≈ 100万ops/月 | ◎ |
| R2 エグレス | **無料** | これが圧倒的に効く | ◎◎ |

**結論**: R2を音声含めて使っても **月額0〜$1** で運用できる。

---

## 4. データ層設計 (D1 / SQLite + FTS5)

```sql
-- schema.sql
CREATE TABLE genres (
  slug      TEXT PRIMARY KEY,
  label_ja  TEXT NOT NULL,
  label_en  TEXT NOT NULL,
  cover     TEXT,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE songs (
  id          TEXT PRIMARY KEY,         -- uuid
  slug        TEXT UNIQUE NOT NULL,     -- url-safe slug
  title       TEXT NOT NULL,
  genre       TEXT NOT NULL,            -- FK genres.slug
  description TEXT,
  tags        TEXT,                      -- カンマ区切り原文
  duration    REAL,                      -- 秒
  bpm         REAL,
  model       TEXT,
  audio_key   TEXT NOT NULL,             -- R2のキー (audio/jazz/xxx.mp3)
  image_key   TEXT,                      -- R2のキー (images/jazz/xxx.jpeg)
  bpm_bucket  TEXT GENERATED ALWAYS AS
    (CASE WHEN bpm < 80 THEN 'slow'
          WHEN bpm < 120 THEN 'mid'
          ELSE 'fast' END) STORED,
  dur_bucket  TEXT GENERATED ALWAYS AS
    (CASE WHEN duration < 30 THEN 'short'
          WHEN duration < 120 THEN 'mid'
          ELSE 'long' END) STORED,
  created_at  TEXT NOT NULL,
  download_count INTEGER DEFAULT 0,
  play_count     INTEGER DEFAULT 0
);

CREATE INDEX idx_songs_genre   ON songs(genre);
CREATE INDEX idx_songs_created ON songs(created_at DESC);
CREATE INDEX idx_songs_bpm     ON songs(bpm_bucket);
CREATE INDEX idx_songs_dur     ON songs(dur_bucket);
CREATE INDEX idx_songs_dl      ON songs(download_count DESC);

-- 全文検索 (FTS5)。日本語は trigram トークナイザで部分一致を効かせる
CREATE VIRTUAL TABLE songs_fts USING fts5(
  title, description, tags, genre,
  content='songs', content_rowid='rowid',
  tokenize='trigram'
);

-- songs から fts への自動同期トリガ
CREATE TRIGGER songs_ai AFTER INSERT ON songs BEGIN
  INSERT INTO songs_fts(rowid,title,description,tags,genre)
    VALUES (new.rowid,new.title,new.description,new.tags,new.genre);
END;
CREATE TRIGGER songs_ad AFTER DELETE ON songs BEGIN
  INSERT INTO songs_fts(songs_fts,rowid,title,description,tags,genre)
    VALUES ('delete',old.rowid,old.title,old.description,old.tags,old.genre);
END;
CREATE TRIGGER songs_au AFTER UPDATE ON songs BEGIN
  INSERT INTO songs_fts(songs_fts,rowid,title,description,tags,genre)
    VALUES ('delete',old.rowid,old.title,old.description,old.tags,old.genre);
  INSERT INTO songs_fts(rowid,title,description,tags,genre)
    VALUES (new.rowid,new.title,new.description,new.tags,new.genre);
END;
```

**ポイント:**
- `bpm_bucket` / `dur_bucket` を生成カラムにすることで、フィルタが等値検索→インデックス利用で高速。
- FTS5 の `trigram` で「夜カフェ」のような日本語の部分一致もカバー。
- `download_count` / `play_count` は Workers から `UPDATE … += 1` で集計。

---

## 5. API設計 (REST)

| Method | Path | 概要 | キャッシュ |
|---|---|---|---|
| GET | `/api/genres` | ジャンル一覧 + 件数 | 1h Edge Cache |
| GET | `/api/songs?genre=&bpm=&dur=&mood=&sort=&page=&limit=` | 一覧 (24件/page) | 5min |
| GET | `/api/search?q=&page=&limit=` | 全文検索 | 5min (qごと) |
| GET | `/api/song/:slug` | 詳細1件 | 1h |
| GET | `/api/popular?period=week` | 人気順(KV集計) | 10min |
| POST | `/api/play` `{id}` | 再生カウント+1 (バックグラウンド) | — |
| POST | `/api/download` `{id}` | DLカウント+1 | — |
| POST | `/api/admin/songs` | 楽曲追加 (要Bearer) | — |
| PATCH | `/api/admin/songs/:id` | メタ更新 | — |
| DELETE | `/api/admin/songs/:id` | 削除 | — |

**レスポンス形** (`/api/songs`)
```json
{
  "page": 1,
  "limit": 24,
  "total": 2070,
  "items": [
    { "id":"…","slug":"midnight-pour-over_9aaa","title":"Midnight Pour Over",
      "genre":"jazz","duration":126,"bpm":85.4,
      "audio_url":"https://cdn.example.com/audio/jazz/midnight-pour-over_9aaa.mp3",
      "image_url":"https://cdn.example.com/images/jazz/midnight-pour-over_9aaa.jpeg" }
  ]
}
```

---

## 6. Workers実装サンプル (TypeScript / Hono)

```toml
# wrangler.toml
name = "bgm-api"
main = "src/index.ts"
compatibility_date = "2026-04-01"

[[d1_databases]]
binding = "DB"
database_name = "bgm"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

[[kv_namespaces]]
binding = "KV"
id = "yyyyyyyyyyyy"

[vars]
R2_PUBLIC_BASE = "https://cdn.example.com"
ALLOWED_ORIGIN = "https://example.com"

# 管理者トークンは secret で
# wrangler secret put ADMIN_TOKEN
```

```ts
// src/index.ts
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { cache } from 'hono/cache';
import { bearerAuth } from 'hono/bearer-auth';

type Env = {
  DB: D1Database;
  KV: KVNamespace;
  R2_PUBLIC_BASE: string;
  ALLOWED_ORIGIN: string;
  ADMIN_TOKEN: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  return cors({ origin: c.env.ALLOWED_ORIGIN, allowMethods:['GET','POST','PATCH','DELETE'] })(c, next);
});

// ---- helper ----
const toUrl = (base: string, key?: string|null) =>
  key ? `${base}/${key}` : null;

const mapRow = (base: string) => (r: any) => ({
  id: r.id, slug: r.slug, title: r.title, genre: r.genre,
  description: r.description, tags: r.tags,
  duration: r.duration, bpm: r.bpm,
  audio_url: toUrl(base, r.audio_key),
  image_url: toUrl(base, r.image_key),
  created_at: r.created_at,
});

// ---- public endpoints ----
app.get('/api/genres',
  cache({ cacheName:'genres', cacheControl:'public, max-age=3600' }),
  async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT g.*, COUNT(s.id) AS count
       FROM genres g LEFT JOIN songs s ON s.genre=g.slug
       GROUP BY g.slug ORDER BY g.sort_order, count DESC`
    ).all();
    return c.json(results);
});

app.get('/api/songs',
  cache({ cacheName:'songs', cacheControl:'public, max-age=300' }),
  async (c) => {
    const url = new URL(c.req.url);
    const genre = url.searchParams.get('genre');
    const bpm   = url.searchParams.get('bpm');     // slow|mid|fast
    const dur   = url.searchParams.get('dur');     // short|mid|long
    const sort  = url.searchParams.get('sort') || 'new';
    const page  = Math.max(1, +(url.searchParams.get('page') || 1));
    const limit = Math.min(100, +(url.searchParams.get('limit') || 24));
    const offset = (page-1) * limit;

    const where: string[] = []; const params: any[] = [];
    if (genre && genre !== 'all') { where.push('genre = ?'); params.push(genre); }
    if (bpm)  { where.push('bpm_bucket = ?'); params.push(bpm); }
    if (dur)  { where.push('dur_bucket = ?'); params.push(dur); }
    const sql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const order = ({
      'new':       'created_at DESC',
      'bpm-asc':   'bpm ASC',
      'bpm-desc':  'bpm DESC',
      'dur-asc':   'duration ASC',
      'dur-desc':  'duration DESC',
      'popular':   'download_count DESC',
      'title':     'title COLLATE NOCASE'
    } as Record<string,string>)[sort] || 'created_at DESC';

    const rows = await c.env.DB.prepare(
      `SELECT * FROM songs ${sql} ORDER BY ${order} LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all();

    const total = await c.env.DB.prepare(
      `SELECT COUNT(*) AS c FROM songs ${sql}`
    ).bind(...params).first<{c:number}>();

    return c.json({
      page, limit, total: total?.c ?? 0,
      items: rows.results.map(mapRow(c.env.R2_PUBLIC_BASE)),
    });
});

app.get('/api/search', async (c) => {
  const q = (c.req.query('q') || '').trim();
  if (!q) return c.json({ items: [], total: 0 });
  const page  = Math.max(1, +(c.req.query('page') || 1));
  const limit = Math.min(50, +(c.req.query('limit') || 24));

  // FTS5 trigram で部分一致
  const rows = await c.env.DB.prepare(
    `SELECT s.* FROM songs_fts f
     JOIN songs s ON s.rowid = f.rowid
     WHERE songs_fts MATCH ?
     ORDER BY rank
     LIMIT ? OFFSET ?`
  ).bind(q, limit, (page-1)*limit).all();

  return c.json({
    page, limit,
    items: rows.results.map(mapRow(c.env.R2_PUBLIC_BASE)),
  });
});

app.get('/api/song/:slug',
  cache({ cacheName:'song', cacheControl:'public, max-age=3600' }),
  async (c) => {
    const r = await c.env.DB.prepare(`SELECT * FROM songs WHERE slug = ?`)
      .bind(c.req.param('slug')).first();
    if (!r) return c.json({ error:'not found' }, 404);
    return c.json(mapRow(c.env.R2_PUBLIC_BASE)(r));
});

// ---- counters (waitUntil で非同期発火) ----
app.post('/api/play', async (c) => {
  const { id } = await c.req.json<{id:string}>();
  c.executionCtx.waitUntil(
    c.env.DB.prepare(`UPDATE songs SET play_count = play_count+1 WHERE id=?`).bind(id).run()
  );
  return c.json({ ok:true });
});
app.post('/api/download', async (c) => {
  const { id } = await c.req.json<{id:string}>();
  c.executionCtx.waitUntil(
    c.env.DB.prepare(`UPDATE songs SET download_count = download_count+1 WHERE id=?`).bind(id).run()
  );
  return c.json({ ok:true });
});

// ---- 人気ランキング (cron で集計→KVへ) ----
app.get('/api/popular', async (c) => {
  const cached = await c.env.KV.get('popular:week', 'json');
  if (cached) return c.json(cached);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM songs ORDER BY download_count DESC LIMIT 30`
  ).all();
  const data = results.map(mapRow(c.env.R2_PUBLIC_BASE));
  await c.env.KV.put('popular:week', JSON.stringify(data), { expirationTtl: 600 });
  return c.json(data);
});

// ---- admin ----
const admin = new Hono<{ Bindings: Env }>();
admin.use('*', async (c, next) =>
  bearerAuth({ token: c.env.ADMIN_TOKEN })(c, next)
);

admin.post('/songs', async (c) => {
  const b = await c.req.json();
  await c.env.DB.prepare(
    `INSERT INTO songs (id,slug,title,genre,description,tags,duration,bpm,model,audio_key,image_key,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(b.id,b.slug,b.title,b.genre,b.description,b.tags,b.duration,b.bpm,b.model,b.audio_key,b.image_key,b.created_at).run();
  return c.json({ ok:true });
});

admin.patch('/songs/:id', async (c) => {
  const id = c.req.param('id');
  const b = await c.req.json<Record<string, any>>();
  const fields = Object.keys(b);
  if (!fields.length) return c.json({ error:'no fields' }, 400);
  const set = fields.map(f => `${f}=?`).join(',');
  await c.env.DB.prepare(`UPDATE songs SET ${set} WHERE id=?`)
    .bind(...fields.map(f => b[f]), id).run();
  return c.json({ ok:true });
});

admin.delete('/songs/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM songs WHERE id=?`)
    .bind(c.req.param('id')).run();
  return c.json({ ok:true });
});

app.route('/api/admin', admin);

export default app;
```

---

## 7. インポートスクリプト (既存 index.json → D1)

`scripts/import_to_d1.mjs` :

```js
// node scripts/import_to_d1.mjs
// 既存の site/data/index.json と genres.json を D1 に流し込む。
// wrangler d1 execute で sql を実行する形にする。
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const songs   = JSON.parse(fs.readFileSync('site/data/index.json','utf8'));
const genres  = JSON.parse(fs.readFileSync('site/data/genres.json','utf8'));

const esc = v => v == null ? 'NULL'
  : typeof v === 'number' ? v
  : "'" + String(v).replace(/'/g, "''") + "'";

let sql = '';
sql += 'BEGIN;\n';

for (const g of genres) {
  sql += `INSERT OR REPLACE INTO genres (slug,label_ja,label_en,cover,sort_order) VALUES (${esc(g.slug)},${esc(g.label_ja)},${esc(g.label_en)},${esc(g.cover)},${esc(g.count)});\n`;
}

for (const s of songs) {
  sql += `INSERT OR REPLACE INTO songs (id,slug,title,genre,description,tags,duration,bpm,model,audio_key,image_key,created_at) VALUES (${esc(s.id)},${esc(s.slug)},${esc(s.title)},${esc(s.genre)},${esc(s.description)},${esc(s.tags)},${esc(s.duration)},${esc(s.bpm)},${esc(s.model)},${esc(s.audio)},${esc(s.image)},${esc(s.created_at)});\n`;
}

sql += 'COMMIT;\n';

const tmp = path.join(process.cwd(), '.import.sql');
fs.writeFileSync(tmp, sql);
console.log(`Wrote ${tmp} (${(sql.length/1024).toFixed(1)} KB). Importing...`);
execSync(`wrangler d1 execute bgm --remote --file=${tmp}`, { stdio:'inherit' });
fs.unlinkSync(tmp);
```

> 大量INSERTは一発バッチでOK。リモートD1への一括実行は`wrangler d1 execute --file=…`が最速。

---

## 8. R2 バケット & 公開ドメイン

```bash
# 作成
wrangler r2 bucket create bgm-assets

# 中身を流し込み (rclone か wrangler r2 object put)
rclone copy ./audio  r2:bgm-assets/audio
rclone copy ./images r2:bgm-assets/images

# Custom Domain で公開 (Cloudflare ダッシュボードで cdn.example.com を設定)
# ⇒ ブラウザから https://cdn.example.com/audio/jazz/xxx.mp3 で直接配信
```

公開設定後は `R2_PUBLIC_BASE = "https://cdn.example.com"` を Workers に渡せば、APIから返す `audio_url` がそのまま使える。

---

## 9. フロントエンド統合 (現 index.html を Pages 化)

現状のSPA(`index.html`)が `fetch('site/data/index.json')` で全件読み込んでいるのを **API呼び出しに差し替えるだけ** で動く。差分の擬似コード:

```diff
- const all = await fetch('site/data/index.json').then(r=>r.json());
- const g   = await fetch('site/data/genres.json').then(r=>r.json());
+ const API = 'https://api.example.com';
+ async function fetchGenres() { return fetch(`${API}/api/genres`).then(r=>r.json()); }
+ async function fetchSongs(params) {
+   const qs = new URLSearchParams(params).toString();
+   return fetch(`${API}/api/songs?${qs}`).then(r=>r.json());
+ }
+ async function fetchSearch(q, page) {
+   return fetch(`${API}/api/search?q=${encodeURIComponent(q)}&page=${page}`).then(r=>r.json());
+ }
```

**変更ポイント:**
- 初期ロードで `/api/genres` と `/api/songs?page=1` を並列取得 (合計~50KB)。**1.1MB → 50KB** に激減。
- フィルタ操作のたびに `/api/songs?genre=jazz&bpm=mid&page=1` を叩く。Cache APIで2回目以降はエッジから即返す。
- 検索は `/api/search?q=…` に切替。
- カードの `<img src>`・`<audio src>`・`<a href download>` は API が返す絶対URL (`https://cdn.example.com/...`) をそのまま使う。

---

## 10. 管理画面 (admin.example.com)

別の Pages プロジェクトとして切り出し、**Cloudflare Access** でメール認証 or IP制限。

```html
<!-- admin/index.html (抜粋) -->
<input id="token" type="password" placeholder="管理者トークン">
<form id="form">
  <input name="title" placeholder="タイトル" required>
  <select name="genre">…</select>
  <input name="bpm" type="number" step="0.01">
  <input name="duration" type="number" step="0.01">
  <textarea name="description"></textarea>
  <input name="tags" placeholder="カンマ区切り">
  <input name="audio_file" type="file" accept="audio/mp3">
  <input name="image_file" type="file" accept="image/jpeg">
  <button>追加</button>
</form>
<script>
const API = 'https://api.example.com';
form.onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData(form);
  const token = document.getElementById('token').value;
  // 1) R2 に直接アップロード（Worker 経由の署名URLでも可）
  const audio = await uploadToR2(fd.get('audio_file'), 'audio', token);
  const image = await uploadToR2(fd.get('image_file'), 'images', token);
  // 2) D1 にメタ登録
  const body = {
    id: crypto.randomUUID(),
    slug: slugify(fd.get('title')),
    title: fd.get('title'),
    genre: fd.get('genre'),
    description: fd.get('description'),
    tags: fd.get('tags'),
    bpm: +fd.get('bpm'),
    duration: +fd.get('duration'),
    model: 'manual',
    audio_key: audio.key,
    image_key: image.key,
    created_at: new Date().toISOString()
  };
  const r = await fetch(`${API}/api/admin/songs`, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body: JSON.stringify(body)
  });
  alert(r.ok ? '✓ 追加しました' : '✗ 失敗');
};
</script>
```

R2へのアップロードは Worker 側に `POST /api/admin/upload?kind=audio` を生やし、Worker → R2 PUT で素通りさせるのがシンプル。

---

## 11. デプロイ手順 (まとめ)

```bash
# 0. プロジェクト初期化
npm create cloudflare@latest bgm-api -- --type=hono
cd bgm-api && npm i

# 1. D1 を作成 + スキーマ流し込み
wrangler d1 create bgm
# 返ってきた database_id を wrangler.toml に貼る
wrangler d1 execute bgm --remote --file=schema.sql

# 2. KV / R2 を作成
wrangler kv namespace create KV
wrangler r2 bucket create bgm-assets

# 3. ダッシュボードで R2 バケットを Custom Domain (cdn.example.com) 公開

# 4. R2 へ既存ファイルをアップロード
rclone copy ./audio  r2:bgm-assets/audio  --transfers=8
rclone copy ./images r2:bgm-assets/images --transfers=8

# 5. D1 へ既存メタを流し込み
node scripts/import_to_d1.mjs

# 6. Workers に Secret セット
wrangler secret put ADMIN_TOKEN

# 7. デプロイ
wrangler deploy

# 8. Pages デプロイ (別ディレクトリで)
wrangler pages deploy ./public --project-name=bgm-site
```

---

## 12. 追加最適化アイデア

| 案 | 効果 |
|---|---|
| ジャンル別ページを **静的事前生成** (Astro/Eleventy で `/genre/jazz/` を build時にレンダリング) | SEOが伸びる + Workers 呼び出しゼロ |
| `Cache-Control: s-maxage=300, stale-while-revalidate=86400` | API応答を5分新鮮に保ちつつ、24時間は古いキャッシュを即返す |
| 検索クエリの **Top1000を1日1回プリウォーム** (Cron Trigger) | 「ジャズ」「夜カフェ」など定番ワードが常にホット |
| 音声を **128kbps MP3 + 32kbps Opus プレビュー** で配信 | 試聴時の帯域↓・体感速度↑ |
| Sitemap.xml と JSON-LD (`MusicRecording`) を Pages で自動生成 | Google 検索からの流入を最大化 |
| Turnstile (Cloudflare CAPTCHA) で `/api/download` 保護 | スクレイピング対策 |
| `D1 Read Replication` (将来) | アジア圏でレイテンシ < 50ms |

---

## 13. 次にやるなら

1. **wrangler 初期化 + D1 スキーマ実行** ← 数十分でできる
2. **import_to_d1.mjs で 2,070曲を流し込み**
3. **Workers をデプロイ → curl で `/api/songs` を叩く**
4. **既存 index.html の fetch を API URL に切替**
5. **R2 にアップロード + Custom Domain 設定**
6. **管理画面を別Pagesで立ち上げ**
7. **新曲を 2万曲まで増やす**

「やる」と言ってくれたら、まず `wrangler.toml` / `schema.sql` / `src/index.ts` / `import_to_d1.mjs` を実ファイルとして用意します。
