#!/usr/bin/env node
/**
 * add-english-metadata.js
 * ================================================================
 * data/index.json の全曲に title_en と desc_en（英語フィールド）を追加する。
 *
 * title_en: スラグのベース部分をタイトルケースに変換
 *           同一スラグ基底を持つ曲群内でバリアント語（ドリフト等）を英訳して付加
 * desc_en : ジャンル + タグ から生成（APIコール不要）
 *
 * 使い方:
 *   node scripts/add-english-metadata.js
 *   node scripts/add-english-metadata.js --dry-run  # 変更せず確認のみ
 * ================================================================
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'index.json');
const DRY_RUN   = process.argv.includes('--dry-run');

// ── ジャンル 英語ラベル ──────────────────────────────────────────
const GENRE_EN = {
  jazz:            'Jazz',
  ambient:         'Ambient',
  cinematic:       'Cinematic',
  lofi:            'Lo-Fi',
  'lo-fi':         'Lo-Fi',
  pop:             'Pop',
  electronic:      'Electronic',
  rock:            'Rock',
  folk:            'Folk',
  'folk-acoustic': 'Folk / Acoustic',
  hiphop:          'Hip-Hop',
  'hip-hop-rnb':   'Hip-Hop / R&B',
  children:        "Children's",
  childrens:       "Children's",
  anime:           'Anime',
  'japanese-anime':'Anime / Japanese',
  corporate:       'Corporate',
  'corporate-bgm': 'Corporate BGM',
  classical:       'Classical',
  world:           'World',
  'j-pop':         'J-Pop',
  other:           'Other',
};

// ── 日本語バリアント語 → 英語 ─────────────────────────────────────
const VARIANT_MAP = {
  // 色・外観
  'ブルー': 'Blue', 'レッド': 'Red', 'ホワイト': 'White', 'ブラック': 'Black',
  'グリーン': 'Green', 'ゴールド': 'Gold', 'シルバー': 'Silver', 'ピンク': 'Pink',
  'ダーク': 'Dark', 'ライト': 'Light', 'ブライト': 'Bright', 'ネオン': 'Neon',
  // 形式・スタイル
  'ライブ': 'Live', 'ドリフト': 'Drift', 'ループ': 'Loop', 'ミックス': 'Mix',
  'リミックス': 'Remix', 'アコースティック': 'Acoustic', 'エレクトリック': 'Electric',
  'インスト': 'Instrumental', 'ソロ': 'Solo', 'デュオ': 'Duo',
  'ショート': 'Short', 'ロング': 'Long', 'フル': 'Full', 'ミニ': 'Mini',
  // 感情・雰囲気
  '幻想': 'Fantasy', '夢': 'Dream', '希望': 'Hope', '悲しみ': 'Sorrow',
  '喜び': 'Joy', '怒り': 'Fury', '平和': 'Peace', '孤独': 'Solitude',
  'メランコリー': 'Melancholy', 'ノスタルジア': 'Nostalgia', '神秘': 'Mystic',
  // 楽器
  'ピアノ': 'Piano', 'ギター': 'Guitar', 'バイオリン': 'Violin', 'チェロ': 'Cello',
  'サックス': 'Sax', 'フルート': 'Flute', 'トランペット': 'Trumpet',
  'ドラム': 'Drums', 'ベース': 'Bass', 'シンセ': 'Synth',
  // 状態・変形
  'アラート': 'Alert', 'エコー': 'Echo', 'ブーム': 'Boom', 'フロウ': 'Flow',
  'グロウ': 'Glow', 'フェード': 'Fade', 'ライズ': 'Rise', 'フォール': 'Fall',
  'スロー': 'Slow', 'ファスト': 'Fast', 'クール': 'Cool', 'ホット': 'Hot',
  'テンション': 'Tension', 'シグナル': 'Signal', 'シャドウ': 'Shadow',
  'アルファ': 'Alpha', 'バイブ': 'Vibe', 'ドープ': 'Dope', 'ポップ': 'Pop',
  // 時間・場所
  '夜': 'Night', '朝': 'Morning', '昼': 'Noon', '夕': 'Evening',
  '春': 'Spring', '夏': 'Summer', '秋': 'Autumn', '冬': 'Winter',
  '都市': 'City', '森': 'Forest', '海': 'Ocean', '山': 'Mountain',
  '星': 'Stars', '月': 'Moon', '太陽': 'Sun', '花': 'Blossom',
  '窓': 'Window', '道': 'Path', '川': 'River', '小川': 'Brook',
  '雨': 'Rain', '湯気': 'Steam', '神社': 'Shrine', '渋谷': 'Shibuya',
  '電車': 'Train', '真夜中': 'Midnight',
  // 情景・動作
  '漂い': 'Float', '走り': 'Rush', '探求': 'Quest', '輝き': 'Shine',
  '歩み': 'Steps', '鼓動': 'Pulse', '旅路': 'Journey', 'そよ風': 'Breeze',
  '脈動': 'Pulse', '越え': 'Over', 'ときめき': 'Spark', '音符': 'Note',
  'パレード': 'Parade', 'ルーム': 'Room', '光': 'Light',
  // その他
  'バージョン': 'Version', 'プロ': 'Pro', 'プラス': 'Plus',
  'マックス': 'Max', 'ネクスト': 'Next', 'ラスト': 'Last',
};

// ── スラグ基底 → English タイトル ──────────────────────────────
function slugBaseToTitle(base) {
  if (!base || base === 'track') return null;
  return base.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ── 英語説明文を生成 ──────────────────────────────────────────
function buildDescEn(song) {
  const genre     = GENRE_EN[song.genre] || (song.genre ? song.genre.charAt(0).toUpperCase() + song.genre.slice(1) : '');
  const tags      = (song.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const bpm       = song.bpm ? `BPM ${Math.round(song.bpm)}` : null;
  // タグから "XX BPM BGM" 等の BPM 表記を除外、先頭5つに絞る
  const cleanTags = tags.filter(t => !/^\d+\s*BPM\b/i.test(t)).slice(0, 5);

  const parts = [];
  if (genre) parts.push(`${genre} BGM`);
  if (cleanTags.length) parts.push(cleanTags.join(', '));
  if (bpm) parts.push(bpm);

  return parts.join(' · ') || 'Free BGM';
}

// ── メイン処理 ─────────────────────────────────────────────────
const songs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

// songs をスラグ基底でグループ化
const byBase = new Map();
for (const song of songs) {
  const slug = song.slug || song.id || '';
  const base = slug.replace(/_[a-f0-9]{8,}$/, '');
  if (!byBase.has(base)) byBase.set(base, []);
  byBase.get(base).push(song);
}

let generated = 0, fallback = 0;

for (const [base, group] of byBase) {
  const baseEn = slugBaseToTitle(base);

  // グループ内で ・ の少ない順にソート（最少 = ベース曲）
  const sorted = group.slice().sort((a, b) =>
    (a.title || '').split('・').length - (b.title || '').split('・').length
  );
  const baseParts = (sorted[0]?.title || '').split('・').length;

  for (const song of group) {
    // desc_en は全曲共通ロジック
    song.desc_en = buildDescEn(song);

    if (!baseEn) {
      // track_xxxx など — 日本語タイトルをそのままフォールバック
      song.title_en = song.title || '';
      fallback++;
      continue;
    }

    const parts      = (song.title || '').split('・');
    const extraParts = parts.slice(baseParts);  // ベース曲より多い分がバリアント

    if (extraParts.length === 0) {
      song.title_en = baseEn;
    } else {
      const enExtras = extraParts.map(p => VARIANT_MAP[p] || p);
      song.title_en = baseEn + ' ' + enExtras.join(' ');
    }
    generated++;
  }
}

console.log(`\n✅ 英語メタデータ生成完了`);
console.log(`   スラグから生成 : ${generated} 曲`);
console.log(`   フォールバック : ${fallback} 曲 (track_xxx など)`);

if (DRY_RUN) {
  console.log('\n⚠️  --dry-run モード: ファイルは変更しません');
  console.log('\nサンプル:');
  for (const s of songs.slice(0, 8)) {
    console.log(`  [${s.title}]`);
    console.log(`    title_en: ${s.title_en}`);
    console.log(`    desc_en:  ${s.desc_en}`);
  }
} else {
  fs.writeFileSync(DATA_FILE, JSON.stringify(songs, null, 0), 'utf8');
  console.log(`\n   出力先 : ${DATA_FILE}`);
  console.log(`   ファイルサイズ: ${(fs.statSync(DATA_FILE).size / 1024 / 1024).toFixed(2)} MB`);
}
