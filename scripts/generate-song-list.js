#!/usr/bin/env node
/**
 * generate-song-list.js
 * ================================================================
 * data/index.json を読み込み、全曲一覧ページ（HTMLサイトマップ）を
 * songs-list/ ディレクトリに生成する。
 *
 * 出力:
 *   songs-list/index.html   (1ページ目)
 *   songs-list/page-2.html  (2ページ目)
 *   ...
 *
 * 使い方:
 *   node scripts/generate-song-list.js
 * ================================================================
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const BASE       = 'https://nihonichi-bgm.com';
const PER_PAGE   = 150;
const DATA_FILE  = path.resolve(__dirname, '../data/index.json');
const OUT_DIR    = path.resolve(__dirname, '../songs-list');

const GENRE_LABELS = {
  'jazz':          'ジャズ',
  'ambient':       'アンビエント',
  'cinematic':     'シネマティック',
  'lo-fi':         'Lo-Fi',
  'lofi':          'Lo-Fi',
  'electronic':    'エレクトロニック',
  'pop':           'ポップ',
  'rock':          'ロック',
  'folk-acoustic': 'フォーク/アコースティック',
  'hip-hop-rnb':   'ヒップホップ/R&B',
  'childrens':     'キッズ/童謡',
  'japanese-anime':'アニメ/邦楽',
  'wafu':          '和風',
  'k-pop':         'K-POP',
  'j-pop':         'J-POP',
  'horror':        'ホラー',
  'corporate-bgm': '企業/ドキュメンタリー',
  'other':         'その他',
};

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pageHref(pageNum) {
  return pageNum === 1 ? '/songs-list/' : `/songs-list/page-${pageNum}.html`;
}

function buildPagination(current, total) {
  const items = [];

  if (current > 1) {
    items.push(`<a href="${pageHref(current - 1)}" class="pg-btn" rel="prev">← 前へ</a>`);
  } else {
    items.push(`<span class="pg-btn pg-dis">← 前へ</span>`);
  }

  const showPages = new Set([1, total]);
  for (let i = Math.max(1, current - 2); i <= Math.min(total, current + 2); i++) {
    showPages.add(i);
  }
  const sorted = [...showPages].sort((a, b) => a - b);

  let prev = 0;
  for (const p of sorted) {
    if (prev && p - prev > 1) items.push(`<span class="pg-ell">…</span>`);
    if (p === current) {
      items.push(`<span class="pg-btn pg-cur">${p}</span>`);
    } else {
      items.push(`<a href="${pageHref(p)}" class="pg-btn">${p}</a>`);
    }
    prev = p;
  }

  if (current < total) {
    items.push(`<a href="${pageHref(current + 1)}" class="pg-btn" rel="next">次へ →</a>`);
  } else {
    items.push(`<span class="pg-btn pg-dis">次へ →</span>`);
  }

  return `<nav class="pagination" aria-label="ページナビゲーション">${items.join('')}</nav>`;
}

function buildPage(songs, pageNum, totalPages, totalSongs) {
  const start = (pageNum - 1) * PER_PAGE + 1;
  const end   = Math.min(pageNum * PER_PAGE, totalSongs);
  const title = pageNum === 1
    ? `全曲一覧（${totalSongs.toLocaleString()}曲） | 日本一フリーBGM`
    : `全曲一覧 - ${pageNum}ページ目 | 日本一フリーBGM`;
  const desc  = `日本一フリーBGMの全${totalSongs.toLocaleString()}曲を一覧表示。商用利用OK・完全無料のAI生成BGMを曲名とジャンルで確認できます。`;
  const canon = pageNum === 1 ? `${BASE}/songs-list/` : `${BASE}/songs-list/page-${pageNum}.html`;
  const prevLink = pageNum > 1 ? `<link rel="prev" href="${BASE}${pageHref(pageNum - 1)}">` : '';
  const nextLink = pageNum < totalPages ? `<link rel="next" href="${BASE}${pageHref(pageNum + 1)}">` : '';

  const rows = songs.map((s, i) => {
    const num     = start + i;
    const gLabel  = GENRE_LABELS[s.genre] || s.genre || '';
    const href    = `/songs/${escHtml(s.slug || s.id)}`;
    const titleJa = escHtml(s.title || s.title_en || s.slug);
    const bpm     = s.bpm ? `♩${Math.round(s.bpm)}` : '';
    const dur     = s.duration
      ? `${Math.floor(s.duration / 60)}:${String(s.duration % 60).padStart(2, '0')}`
      : '';
    return `<tr>
      <td class="num">${num}</td>
      <td class="tit"><a href="${href}">${titleJa}</a></td>
      <td class="gen"><span class="badge">${escHtml(gLabel)}</span></td>
      <td class="meta">${dur}${bpm ? `<span class="bpm"> ${bpm}</span>` : ''}</td>
    </tr>`;
  }).join('\n');

  const pagination = buildPagination(pageNum, totalPages);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(desc)}">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${canon}">
${prevLink}
${nextLink}
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(desc)}">
<meta property="og:url" content="${canon}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="日本一フリーBGM">
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type":"ListItem","position":1,"name":"トップ","item":"${BASE}/"},
    {"@type":"ListItem","position":2,"name":"全曲一覧","item":"${BASE}/songs-list/"}${pageNum > 1 ? `,\n    {"@type":"ListItem","position":3,"name":"${pageNum}ページ目","item":"${canon}"}` : ''}
  ]
}
<\/script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#faf8f5;color:#1a1008;line-height:1.6;font-size:14px}
a{color:#c85a1e;text-decoration:none}
a:hover{text-decoration:underline}
header{background:#0d0b08;color:#fff;padding:14px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.logo{font-size:16px;font-weight:800;color:#fff;text-decoration:none}
.logo:hover{color:#e87846;text-decoration:none}
header nav{display:flex;gap:16px;flex-wrap:wrap}
header nav a{color:rgba(255,255,255,.7);font-size:13px}
header nav a:hover{color:#fff;text-decoration:none}
main{max-width:1100px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:1.4rem;font-weight:800;margin-bottom:4px}
.sub{font-size:13px;color:#7a6a58;margin-bottom:20px}
.sub b{color:#1a1008}
table{width:100%;border-collapse:collapse}
thead th{text-align:left;font-size:12px;color:#7a6a58;font-weight:700;padding:8px 10px;border-bottom:2px solid #e8e0d4;letter-spacing:.05em;text-transform:uppercase}
tbody tr{border-bottom:1px solid #f0ebe3;transition:background .12s}
tbody tr:hover{background:#f5f0ea}
td{padding:9px 10px;vertical-align:middle}
td.num{color:#b0a090;font-size:12px;width:48px;text-align:right;font-variant-numeric:tabular-nums}
td.tit a{font-size:14px;font-weight:600;color:#1a1008}
td.tit a:hover{color:#c85a1e;text-decoration:none}
td.gen{width:160px}
.badge{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 9px;border-radius:20px;background:#f0e8e0;color:#6b4c2a;letter-spacing:.04em}
td.meta{color:#7a6a58;font-size:12px;white-space:nowrap;width:110px}
.bpm{font-size:11px;color:#b0a090}
.pagination{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:28px;margin-bottom:28px;flex-wrap:wrap}
.pg-btn{display:inline-flex;align-items:center;justify-content:center;min-width:38px;height:36px;padding:0 10px;border-radius:8px;font-size:13px;font-weight:600;border:1px solid #e0d8cc;background:#fff;color:#1a1008;text-decoration:none;transition:all .15s}
.pg-btn:hover{background:#c85a1e;color:#fff;border-color:#c85a1e;text-decoration:none}
.pg-cur{background:#c85a1e;color:#fff;border-color:#c85a1e;cursor:default}
.pg-dis{color:#c0b0a0;cursor:default;background:#f5f0ea}
.pg-ell{padding:0 4px;color:#b0a090;font-size:13px}
footer{background:#0d0b08;color:rgba(255,255,255,.5);text-align:center;padding:16px;font-size:12px}
footer a{color:rgba(255,255,255,.6)}
footer a:hover{color:#fff;text-decoration:none}
@media(max-width:600px){
  td.gen,td.meta{display:none}
  td.num{width:32px;font-size:11px}
  h1{font-size:1.2rem}
}
</style>
</head>
<body>
<header>
  <a href="${BASE}/" class="logo">🎵 日本一フリーBGM</a>
  <nav>
    <a href="${BASE}/">トップ</a>
    <a href="${BASE}/#browse">全曲を聴く</a>
    <a href="${BASE}/#genshow">ジャンル</a>
    <a href="${BASE}/#license">利用規約</a>
  </nav>
</header>
<main>
  <h1>全曲一覧</h1>
  <p class="sub">全 <b>${totalSongs.toLocaleString()}</b> 曲 ／ ${start}〜${end}件を表示（${pageNum} / ${totalPages} ページ）</p>
  ${pagination}
  <table>
    <thead><tr>
      <th>#</th>
      <th>曲名</th>
      <th>ジャンル</th>
      <th>尺 / BPM</th>
    </tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
  ${pagination}
</main>
<footer>
  <p>© 2026 日本一フリーBGM — <a href="${BASE}/">トップへ戻る</a> ／ <a href="${BASE}/songs-list/">全曲一覧トップ</a></p>
</footer>
</body>
</html>`;
}

function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ data/index.json が見つかりません:', DATA_FILE);
    process.exit(1);
  }

  const songs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  songs.sort((a, b) => {
    const da = a.created_at ? new Date(a.created_at).getTime() : 0;
    const db = b.created_at ? new Date(b.created_at).getTime() : 0;
    return db - da;
  });

  const totalSongs = songs.length;
  const totalPages = Math.ceil(totalSongs / PER_PAGE);

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  console.log(`📋 全 ${totalSongs} 曲 → ${totalPages} ページ生成中...`);

  for (let page = 1; page <= totalPages; page++) {
    const chunk   = songs.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const html    = buildPage(chunk, page, totalPages, totalSongs);
    const outFile = page === 1
      ? path.join(OUT_DIR, 'index.html')
      : path.join(OUT_DIR, `page-${page}.html`);

    fs.writeFileSync(outFile, html, 'utf8');
    console.log(`  ✅ /songs-list/${page === 1 ? 'index.html' : `page-${page}.html`} (${chunk.length}曲)`);
  }

  console.log(`\n✨ 完了: songs-list/ に ${totalPages} ページ生成しました`);
  console.log(`   → ${BASE}/songs-list/`);
}

main();
