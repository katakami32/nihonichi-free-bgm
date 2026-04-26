#!/usr/bin/env node
/**
 * fix-duplicate-titles.js
 * index.json + data/by-genre/*.json の重複タイトルを
 * ローマ数字サフィックス（Ⅱ, Ⅲ, ...）で自動修正する。
 *
 * 使い方: node scripts/fix-duplicate-titles.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'data', 'index.json');
const GENRE_DIR  = path.join(ROOT, 'data', 'by-genre');

// 1〜16 対応のローマ数字（1 = 変更なし）
const ROMAN = ['', '', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ',
               'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ', 'XIII', 'XIV', 'XV', 'XVI'];

// ------------------------------------------------------------------
// 1. index.json を読み込み、タイトル → 新タイトル のマップを作成
// ------------------------------------------------------------------
const songs  = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));

// 各タイトルの出現回数を追跡しながら新タイトルを決定
const titleCount = {};   // title → 何番目か
const idToNewTitle = {}; // id → 新タイトル

let renamed = 0;

for (const song of songs) {
  const t = song.title;
  if (titleCount[t] === undefined) {
    titleCount[t] = 1;        // 初出: 変更なし
    idToNewTitle[song.id] = t;
  } else {
    titleCount[t]++;
    const n = titleCount[t];
    const suffix = ROMAN[n] ?? `(${n})`;
    const newTitle = `${t} ${suffix}`;
    idToNewTitle[song.id] = newTitle;
    renamed++;
  }
}

console.log(`index.json: ${songs.length} 曲中 ${renamed} 曲をリネーム`);

// ------------------------------------------------------------------
// 2. index.json に適用して保存
// ------------------------------------------------------------------
const updatedSongs = songs.map(s => ({
  ...s,
  title: idToNewTitle[s.id] ?? s.title
}));

fs.writeFileSync(INDEX_FILE,
  JSON.stringify(updatedSongs, null, 0),   // 1行JSON（容量節約）
  'utf8');
console.log(`✅ data/index.json を更新しました`);

// ------------------------------------------------------------------
// 3. data/by-genre/*.json にも適用
// ------------------------------------------------------------------
const genreFiles = fs.readdirSync(GENRE_DIR).filter(f => f.endsWith('.json'));
let genreTotal = 0;

for (const fname of genreFiles) {
  const fpath = path.join(GENRE_DIR, fname);
  const arr   = JSON.parse(fs.readFileSync(fpath, 'utf8'));

  const updated = arr.map(s => ({
    ...s,
    title: idToNewTitle[s.id] ?? s.title
  }));

  const changed = updated.filter((s, i) => s.title !== arr[i].title).length;
  genreTotal += changed;

  fs.writeFileSync(fpath, JSON.stringify(updated, null, 0), 'utf8');
  console.log(`  ✅ by-genre/${fname}: ${changed} 曲更新`);
}

console.log(`\n完了: 計 ${renamed} 曲のタイトルを修正しました`);
console.log('サンプル確認:');

// 変更後サンプルを表示
const sample = updatedSongs.filter(s => idToNewTitle[s.id] !== s.title.split(' ')[0] + (s.title.includes(' ') ? '' : '')).slice(0, 8);
// 変更されたもの上位8件
const changed8 = updatedSongs.filter(s => {
  const orig = songs.find(o => o.id === s.id);
  return orig && orig.title !== s.title;
}).slice(0, 8);
for (const s of changed8) {
  const orig = songs.find(o => o.id === s.id);
  console.log(`  ${orig.title}  →  ${s.title}`);
}
