#!/usr/bin/env node
/**
 * generate-song-pages.js
 * ================================================================
 * data/index.json の各曲について /songs/<slug>.html を生成する。
 *
 * 生成されるページは:
 *   1. 曲固有の <title> と <meta description>
 *   2. JSON-LD (MusicRecording) 構造化データ
 *   3. OGP タグ（SNSシェア対応）
 *   4. 即時リダイレクト → メインアプリの /#song/<slug>
 *   5. JS 無効環境向けの曲情報テキスト（Googlebot の確実な認識）
 *
 * 使い方:
 *   node scripts/generate-song-pages.js
 *   node scripts/generate-song-pages.js --limit=50    # 先頭50件のみ（テスト用）
 *   node scripts/generate-song-pages.js --clean       # songs/ を削除してから生成
 * ================================================================
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'index.json');
const OUT_DIR   = path.join(ROOT, 'songs');
const BASE_URL  = 'https://nihonichi-freemusicbgm.pages.dev';
const R2_BASE   = 'https://pub-c8052da2182b4317bc252b78e473584c.r2.dev';

const CLEAN     = process.argv.includes('--clean');
const limitArg  = process.argv.find(a => a.startsWith('--limit='));
const LIMIT     = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

// ── ジャンル 日本語ラベル ──────────────────────────────────
const GENRE_JA = {
  jazz:            'ジャズ',
  ambient:         'アンビエント',
  cinematic:       'シネマティック',
  lofi:            'Lo-Fi',
  'lo-fi':         'Lo-Fi',
  pop:             'ポップ',
  electronic:      'エレクトロニック',
  rock:            'ロック',
  folk:            'フォーク',
  'folk-acoustic': 'フォーク・アコースティック',
  hiphop:          'ヒップホップ',
  'hip-hop-rnb':   'ヒップホップ・R&B',
  children:        '子供向け',
  childrens:       '子供向け',
  anime:           'アニメ',
  'japanese-anime':'アニメ・日本風',
  corporate:       'コーポレート',
  'corporate-bgm': 'コーポレートBGM',
  classical:       'クラシック',
  world:           'ワールド',
  'j-pop':         'J-Pop',
  other:           'その他',
};

// ── ユーティリティ ────────────────────────────────────────
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
  );
}

function fmtDur(sec) {
  if (!sec) return null;
  return `${Math.floor(sec / 60)}分${Math.floor(sec % 60)}秒`;
}

function fmtDurISO(sec) {
  // ISO 8601 duration: PT2M6S
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `PT${m}M${s}S`;
}

function escJson(s) {
  return JSON.stringify(String(s || ''));
}

// ── ページ HTML テンプレート ──────────────────────────────
function buildPage(song) {
  const slug    = song.slug || song.id;
  const title   = song.title || slug;
  const gJa     = GENRE_JA[song.genre] || song.genre || 'BGM';
  const desc    = song.description || '';
  const tags    = (song.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const bpm     = song.bpm  ? `BPM ${Math.round(song.bpm)}` : null;
  const dur     = fmtDur(song.duration);
  const durISO  = fmtDurISO(song.duration);
  const imgUrl  = song.image ? `${R2_BASE}/${song.image}` : `${R2_BASE}/images/jazz/midnight-pour-over_9aaa952c.jpeg`;
  const audioUrl= song.audio ? `${R2_BASE}/${song.audio}` : null;
  const pageUrl = `${BASE_URL}/songs/${slug}`;
  const appUrl  = `${BASE_URL}/#song/${slug}`;

  // メタ description（~160字）
  const metaDesc = [
    `「${title}」— ${gJa}のフリーミュージック。`,
    desc ? desc.slice(0, 80) + (desc.length > 80 ? '…' : '') : '',
    tags.length ? `タグ: ${tags.slice(0,4).join(', ')}。` : '',
    '完全無料・商用利用OK・登録不要。日本一フリーMusicより配布。',
  ].filter(Boolean).join(' ').slice(0, 160);

  // メタ一覧テキスト
  const metaList = [bpm, dur, `${gJa}`, tags.length ? tags.join(' / ') : ''].filter(Boolean).join(' | ');

  // JSON-LD (MusicRecording)
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MusicRecording',
    'name': title,
    'description': desc || metaDesc,
    'genre': gJa,
    'duration': durISO,
    'url': pageUrl,
    'mainEntityOfPage': pageUrl,
    'image': imgUrl,
    'isAccessibleForFree': true,
    'license': `${BASE_URL}/#license`,
    'creditText': '日本一フリーMusic',
    'copyrightNotice': '無料・商用利用OK・クレジット不要 / 日本一フリーMusic',
    'keywords': tags.join(', '),
    ...(bpm ? { 'tempo': Math.round(song.bpm) } : {}),
    ...(audioUrl ? {
      'audio': {
        '@type': 'AudioObject',
        'contentUrl': audioUrl,
        'encodingFormat': 'audio/mpeg',
        'duration': durISO,
      }
    } : {}),
    'isPartOf': {
      '@type': 'MusicAlbum',
      'name': `日本一フリーMusic — ${gJa}コレクション`,
      'url': `${BASE_URL}/#genre/${song.genre || ''}`,
    },
    'publisher': {
      '@type': 'Organization',
      'name': '日本一フリーMusic',
      'url': BASE_URL,
    },
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(gJa)}フリーミュージック | 日本一フリーMusic</title>
<meta name="description" content="${esc(metaDesc)}">
<meta name="keywords" content="${esc(['フリーBGM','無料BGM','商用利用可',gJa,...tags].join(','))}">
<link rel="canonical" href="${esc(pageUrl)}">

<!-- OGP -->
<meta property="og:type" content="music.song">
<meta property="og:title" content="${esc(title)} — ${esc(gJa)}フリーミュージック | 日本一フリーMusic">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(imgUrl)}">
<meta property="og:site_name" content="日本一フリーMusic">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} — ${esc(gJa)}フリーミュージック">
<meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="twitter:image" content="${esc(imgUrl)}">

<!-- 構造化データ (MusicRecording) -->
<script type="application/ld+json">${JSON.stringify(ld, null, 0)}</script>

<!-- メインアプリへ即時リダイレクト -->
<script>window.location.replace(${JSON.stringify(appUrl)});</script>
<noscript><meta http-equiv="refresh" content="0;url=${esc(appUrl)}"></noscript>

<style>
body{font-family:'Noto Sans JP',system-ui,sans-serif;background:#faf6f0;color:#1a1008;padding:2rem 1.5rem;max-width:700px;margin:0 auto;line-height:1.7}
h1{font-size:1.6rem;font-weight:900;margin-bottom:.5rem;color:#c85a1e}
.badge{display:inline-block;background:#c85a1e;color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:1rem}
.meta{font-size:13px;color:#8a7060;margin-bottom:1rem}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:1.5rem}
.tag{font-size:12px;background:#f5ede0;border:1px solid #ddd0c0;padding:3px 10px;border-radius:14px;color:#8a7060}
.desc{font-size:14px;color:#3a2a1a;margin-bottom:1.5rem;line-height:1.9}
.backlink{display:inline-block;background:#c85a1e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:9px;font-weight:700;font-size:14px}
.backlink:hover{background:#a84812}
.redirect-note{font-size:12px;color:#8a7060;margin-top:1rem}
</style>
</head>
<body>
<div class="badge">${esc(gJa)}</div>
<h1>${esc(title)}</h1>
<div class="meta">${esc(metaList)}</div>
${desc ? `<div class="desc">${esc(desc)}</div>` : ''}
${tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
<a class="backlink" href="${esc(appUrl)}">▶ この曲を再生・ダウンロードする</a>
<p class="redirect-note">※ このページは自動的にメインサイトに転送されます。転送されない場合は上のリンクをクリックしてください。</p>
<p style="margin-top:2rem;font-size:12px;color:#b09c84">
  <a href="${esc(BASE_URL)}" style="color:#c85a1e">← 日本一フリーMusic トップへ</a> |
  <a href="${esc(BASE_URL)}/#genre/${esc(song.genre||'')}" style="color:#c85a1e">${esc(gJa)}一覧へ</a>
</p>
</body>
</html>`;
}

// ── メイン ────────────────────────────────────────────────
const songs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const target = songs.slice(0, LIMIT === Infinity ? songs.length : LIMIT);

// songs/ ディレクトリの準備
if (CLEAN && fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true });
  console.log('🗑  songs/ ディレクトリをクリアしました');
}
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ページ生成
let generated = 0, skipped = 0;
for (const song of target) {
  const slug = song.slug || song.id;
  if (!slug) { skipped++; continue; }
  const outFile = path.join(OUT_DIR, `${slug}.html`);
  fs.writeFileSync(outFile, buildPage(song), 'utf8');
  generated++;
  if (generated % 200 === 0) process.stdout.write(`   ${generated}/${target.length} 完了...\r`);
}

console.log(`\n✅ songs/ ページ生成完了`);
console.log(`   生成   : ${generated} ページ`);
if (skipped) console.log(`   スキップ: ${skipped} 曲 (slug なし)`);
console.log(`   出力先 : ${OUT_DIR}/`);
console.log(`\n   例: ${BASE_URL}/songs/${(songs[0]?.slug || songs[0]?.id || 'example')}`);
