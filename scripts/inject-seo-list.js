#!/usr/bin/env node
/**
 * inject-seo-list.js
 * ================================================================
 * ビルド時に data/index.json を読み込み、index.html の
 *   <!-- SEO:START --> ... <!-- SEO:END -->
 * の間に「全曲の隠し SEO リスト」を挿入する。
 *
 * Googlebot はこの <section> を読んでキーワード・タイトルを認識する。
 * ユーザーには .seo-catalog CSS で視覚的に非表示（スクリーンリーダーは aria-hidden で除外）。
 *
 * 使い方:
 *   node scripts/inject-seo-list.js              # index.html を直接更新
 *   node scripts/inject-seo-list.js --dry-run    # 変更せず確認だけ
 * ================================================================
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT       = path.resolve(__dirname, '..');
const INDEX_FILE = path.join(ROOT, 'data', 'index.json');
const HTML_FILE  = path.join(ROOT, 'index.html');
const DRY_RUN    = process.argv.includes('--dry-run');

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
function escHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c])
  );
}

function fmtDur(sec) {
  if (!sec) return '';
  return `${Math.floor(sec / 60)}分${Math.floor(sec % 60)}秒`;
}

// ── メイン ────────────────────────────────────────────────
const songs = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
console.log(`📖 index.json 読み込み: ${songs.length} 曲`);

// ジャンルごとにグループ化してセクション構造を作る（Google にとってより構造的）
const byGenre = {};
for (const s of songs) {
  const g = s.genre || 'other';
  if (!byGenre[g]) byGenre[g] = [];
  byGenre[g].push(s);
}

// 各ジャンルのセクションを生成
const genreSections = Object.entries(byGenre).map(([genre, list]) => {
  const gJa   = GENRE_JA[genre] || genre;
  const items  = list.map(s => {
    const tags   = (s.tags || '').split(',').map(t => t.trim()).filter(Boolean);
    const tagJa  = tags.length ? `タグ: ${tags.join(', ')}` : '';
    const bpm    = s.bpm  ? `BPM ${Math.round(s.bpm)}` : '';
    const dur    = fmtDur(s.duration);
    const meta   = [bpm, dur].filter(Boolean).join(' / ');
    // /songs/slug へのリンク（個別ページが存在する場合に Google がクロールできる）
    const href   = `/songs/${escHtml(s.slug || s.id)}`;
    return `      <li><a href="${href}">${escHtml(s.title)}</a>${tagJa ? ` — ${escHtml(tagJa)}` : ''}${meta ? ` [${escHtml(meta)}]` : ''} — ${escHtml(gJa)}フリーBGM 商用利用可</li>`;
  }).join('\n');

  return `  <section class="seo-genre-block">
    <h3>${escHtml(gJa)}のフリーBGM（${list.length}曲）</h3>
    <ul>
${items}
    </ul>
  </section>`;
}).join('\n\n');

// 最終的な SEO ブロック
const totalStr = songs.length.toLocaleString('ja-JP');
const seoBlock = `<!-- SEO:START -->
<div id="seo-song-catalog" class="seo-catalog" aria-hidden="true">
  <h2>フリーBGM全曲カタログ（${totalStr}曲）— 完全無料・商用利用OK・クレジット不要</h2>
  <p>AI生成の高品質フリーBGMを${totalStr}曲配布しています。YouTube・ゲーム実況・Vlog・配信・映像制作・企業VP・ポッドキャストに無料でお使いいただけます。</p>

${genreSections}

  <p>すべての楽曲は著作権フリー・商用利用可・クレジット表記不要でダウンロードできます。</p>
</div>
<!-- SEO:END -->`;

// ── HTML への挿入 ──────────────────────────────────────────
let html = fs.readFileSync(HTML_FILE, 'utf8');

if (html.includes('<!-- SEO:START -->')) {
  html = html.replace(/<!-- SEO:START -->[\s\S]*?<!-- SEO:END -->/g, seoBlock);
  console.log('♻️  既存の SEO ブロックを置換しました');
} else {
  // </body> 直前に挿入
  html = html.replace('</body>', seoBlock + '\n</body>');
  console.log('➕ SEO ブロックを </body> 直前に挿入しました');
}

// ── meta description の曲数を実際の数に更新 ──────────────────
html = html.replace(
  /<meta name="description" content="[^"]*"/,
  `<meta name="description" content="高品質なAI生成BGMを${totalStr}曲、完全無料・商用利用OK・登録不要でダウンロードできるフリーBGMサイト。BPM・尺・ムードで秒で見つかる。YouTube・ゲーム実況・Vlog・配信に。"`
);

// ── <title> の曲数を更新 ──────────────────────────────────
html = html.replace(
  /<title>[^<]*<\/title>/,
  `<title>日本一フリーBGM｜${totalStr}曲のAI生成BGMを完全無料・商用利用OKで配布</title>`
);

// ── JSON-LD description の曲数を更新 ─────────────────────
html = html.replace(
  /"description": "AI生成の高品質フリーBGMを[^"]*?曲、/,
  `"description": "AI生成の高品質フリーBGMを${totalStr}曲、`
);

if (DRY_RUN) {
  console.log('\n🔍 [dry-run] 変更をプレビュー（ファイルは更新しません）');
  console.log(`   SEO ブロック行数: ${seoBlock.split('\n').length}`);
  console.log(`   曲数: ${songs.length}`);
} else {
  fs.writeFileSync(HTML_FILE, html, 'utf8');
  console.log(`\n✅ ${HTML_FILE} を更新しました`);
}

console.log(`\n📊 統計:`);
console.log(`   総曲数        : ${songs.length}`);
console.log(`   ジャンル数    : ${Object.keys(byGenre).length}`);
console.log(`   SEOブロック   : ${seoBlock.length.toLocaleString()} 文字`);
