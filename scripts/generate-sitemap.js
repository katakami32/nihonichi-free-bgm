#!/usr/bin/env node
/**
 * generate-sitemap.js
 * ================================================================
 * data/index.json を読み込み、sitemap.xml をルートに生成する。
 *
 * 生成するエントリ:
 *   1. 静的ページ（トップ、ジャンル等）
 *   2. 各曲の個別ページ /songs/<slug>.html（generate-song-pages.js で生成）
 *
 * 使い方:
 *   node scripts/generate-sitemap.js
 *   node scripts/generate-sitemap.js --base=https://your-domain.com
 * ================================================================
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// ---- 設定 ----------------------------------------------------------------
const DEFAULT_BASE = 'https://nihonichi-freemusicbgm.pages.dev';
const arg   = process.argv.find(a => a.startsWith('--base='));
const BASE  = arg ? arg.split('=')[1].replace(/\/$/, '') : DEFAULT_BASE;

const DATA_FILE   = path.resolve(__dirname, '../data/index.json');
const OUTPUT_FILE = path.resolve(__dirname, '../sitemap.xml');
// --------------------------------------------------------------------------

function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function toDate(iso) {
  return iso ? iso.slice(0, 10) : new Date().toISOString().slice(0, 10);
}

// ---- 静的ページ定義 -------------------------------------------------------
const staticPages = [
  { loc: '/',         priority: '1.0', changefreq: 'weekly'  },
  { loc: '/#pickup',  priority: '0.7', changefreq: 'weekly'  },
  { loc: '/#genshow', priority: '0.7', changefreq: 'monthly' },
  { loc: '/#usec',    priority: '0.6', changefreq: 'monthly' },
  { loc: '/#browse',  priority: '0.9', changefreq: 'daily'   },
  { loc: '/#faq',     priority: '0.5', changefreq: 'monthly' },
  { loc: '/#license', priority: '0.5', changefreq: 'monthly' },
];

// ジャンル別ページもサイトマップに追加
const GENRES = ['jazz','ambient','cinematic','lofi','lo-fi','pop','electronic',
                'rock','folk','folk-acoustic','hiphop','hip-hop-rnb','children',
                'childrens','anime','japanese-anime','corporate','corporate-bgm',
                'j-pop','other'];
for (const g of GENRES) {
  staticPages.push({ loc: `/#genre/${g}`, priority: '0.6', changefreq: 'weekly' });
}

// ---- メイン --------------------------------------------------------------
const songs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

const lines = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
  '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
  '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9',
  '          http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">',
  '',
  '  <!-- ===== 静的ページ ===== -->',
];

for (const page of staticPages) {
  lines.push('  <url>');
  lines.push(`    <loc>${BASE}${escXml(page.loc)}</loc>`);
  lines.push(`    <lastmod>${today}</lastmod>`);
  lines.push(`    <changefreq>${page.changefreq}</changefreq>`);
  lines.push(`    <priority>${page.priority}</priority>`);
  lines.push('  </url>');
}

lines.push('');
lines.push(`  <!-- ===== 楽曲個別ページ (${songs.length}曲) — /songs/<slug>.html ===== -->`);
lines.push('  <!-- 各ページは固有タイトル・JSON-LD・OGPを持つ静的HTML -->');;

for (const song of songs) {
  const slug    = song.slug || song.id;
  if (!slug) continue;
  const lastmod = toDate(song.created_at);
  const loc     = `${BASE}/songs/${escXml(slug)}`;
  lines.push('  <url>');
  lines.push(`    <loc>${loc}</loc>`);
  lines.push(`    <lastmod>${lastmod}</lastmod>`);
  lines.push(`    <changefreq>never</changefreq>`);
  lines.push(`    <priority>0.6</priority>`);
  lines.push('  </url>');
}

lines.push('</urlset>');
lines.push('');

fs.writeFileSync(OUTPUT_FILE, lines.join('\n'), 'utf8');

console.log(`✅ sitemap.xml を生成しました`);
console.log(`   ベース URL  : ${BASE}`);
console.log(`   静的ページ  : ${staticPages.length}`);
console.log(`   楽曲URL     : ${songs.length}`);
console.log(`   合計エントリ: ${staticPages.length + songs.length}`);
console.log(`   出力先      : ${OUTPUT_FILE}`);
