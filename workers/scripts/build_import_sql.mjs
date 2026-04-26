// 既存の site/data/index.json と genres.json から
// D1 用の bulk INSERT SQL を生成する。
// 生成先は workers/.import.sql。
//
// 使い方:
//   node scripts/build_import_sql.mjs
//   wrangler d1 execute bgm --remote --file=.import.sql
//
// (npm script: `npm run import:remote` で両方一気に実行)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');           // プロジェクトルート
const OUT  = path.resolve(__dirname, '..', '.import.sql');

const songsPath  = path.join(ROOT, 'site', 'data', 'index.json');
const genresPath = path.join(ROOT, 'site', 'data', 'genres.json');

if (!fs.existsSync(songsPath))  { console.error('not found:', songsPath);  process.exit(1); }
if (!fs.existsSync(genresPath)) { console.error('not found:', genresPath); process.exit(1); }

const songs  = JSON.parse(fs.readFileSync(songsPath, 'utf8'));
const genres = JSON.parse(fs.readFileSync(genresPath, 'utf8'));

const esc = (v) => {
  if (v === null || v === undefined || v === '') return 'NULL';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
};

const lines = [];
lines.push('PRAGMA foreign_keys = OFF;');
lines.push('BEGIN;');

// ─ genres ─
const orderMap = {
  ambient: 1, cinematic: 2, 'j-pop': 3, jazz: 4, 'lo-fi': 5,
  electronic: 6, 'folk-acoustic': 7, 'hip-hop-rnb': 8, rock: 9,
  pop: 10, childrens: 11, 'japanese-anime': 12, 'corporate-bgm': 13, other: 99,
};
for (const g of genres) {
  lines.push(
    `INSERT OR REPLACE INTO genres (slug,label_ja,label_en,cover,sort_order) VALUES (` +
    [g.slug, g.label_ja, g.label_en, g.cover, orderMap[g.slug] ?? 50].map(esc).join(',') +
    `);`,
  );
}

// ─ songs ─
// 重複 slug を除去（Sunoの2変奏が同タイトルで来ることがあるが、slug は uuid 含むのでユニーク）
const seen = new Set();
let dup = 0;
for (const s of songs) {
  if (seen.has(s.slug)) { dup++; continue; }
  seen.add(s.slug);
  lines.push(
    `INSERT OR REPLACE INTO songs (id,slug,title,genre,description,tags,duration,bpm,model,audio_key,image_key,created_at) VALUES (` +
    [
      s.id, s.slug, s.title, s.genre,
      s.description, s.tags,
      s.duration, s.bpm,
      s.model,
      s.audio,    // audio_key
      s.image,    // image_key
      s.created_at,
    ].map(esc).join(',') +
    `);`,
  );
}

lines.push('COMMIT;');
const sql = lines.join('\n') + '\n';
fs.writeFileSync(OUT, sql);

console.log(`✔ wrote ${OUT}`);
console.log(`  - genres: ${genres.length}`);
console.log(`  - songs:  ${seen.size}` + (dup ? ` (skipped ${dup} duplicate slugs)` : ''));
console.log(`  - size:   ${(sql.length / 1024).toFixed(1)} KB`);
console.log('');
console.log('Next:');
console.log('  wrangler d1 execute bgm --remote --file=.import.sql');
