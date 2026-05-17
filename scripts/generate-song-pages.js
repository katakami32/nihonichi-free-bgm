#!/usr/bin/env node
/**
 * generate-song-pages.js
 * ================================================================
 * data/index.json の各曲について /songs/<slug>.html を生成する。
 *
 * 生成されるページは:
 *   1. 曲固有の <title> と <meta description>（個別最適化）
 *   2. JSON-LD (MusicRecording) 構造化データ
 *   3. OGP タグ（SNSシェア対応）
 *   4. 再生プレイヤー・ダウンロードボタン（既存構造を維持）
 *   5. リッチ解説（~1,000字）＋ 楽曲画像（lazy）
 *
 * 使い方:
 *   node scripts/generate-song-pages.js
 *   node scripts/generate-song-pages.js --limit=1     # 1件のみ（テスト用）
 *   node scripts/generate-song-pages.js --slug=xxx    # 指定slugのみ
 *   node scripts/generate-song-pages.js --clean       # songs/ を削除してから生成
 * ================================================================
 */

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'index.json');
const OUT_DIR   = path.join(ROOT, 'songs');
const BASE_URL  = 'https://nihonichi-bgm.com';
const R2_BASE   = 'https://pub-c8052da2182b4317bc252b78e473584c.r2.dev';

const CLEAN    = process.argv.includes('--clean');
const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT    = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const slugArg  = process.argv.find(a => a.startsWith('--slug='));
const SLUG_FILTER = slugArg ? slugArg.split('=')[1] : null;

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
  'k-pop':         'K-Pop',
  children:        '子供向け',
  childrens:       '子供向け',
  anime:           'アニメ',
  'japanese-anime':'アニメ・日本風',
  corporate:       'コーポレート',
  'corporate-bgm': 'コーポレートBGM',
  classical:       'クラシック',
  world:           'ワールド',
  'j-pop':         'J-Pop',
  wafu:            '和風',
  horror:          'ホラー',
  other:           'その他',
};

// ── ジャンル別コンテンツ辞書 ──────────────────────────────
const GENRE_DATA = {
  jazz: {
    mood: ['温かみのある落ち着いたサウンド', 'ソウルフルな余韻が漂う大人の質感', 'しっとりとした情感と洗練されたグルーヴ感', '夜のジャズクラブを想わせる陶酔感', '深みのある即興演奏が生み出すライブ感'],
    scene: 'カフェや料理動画、インタビュー映像、ポッドキャスト、Vlogのオープニングなど、落ち着いた雰囲気を演出したいシーンに最適です。夜のドライブ映像や、大人向けライフスタイル動画のBGMとしても高い支持を受けています。お洒落な映像制作・料理系YouTube・バー紹介動画などにもぴったりです。',
    instruments: 'ジャズ特有のブラシドラム、ウッドベースの重厚な低音、ピアノの即興的なフレーズが絡み合い、',
  },
  ambient: {
    mood: ['広大な空間を満たす透明感', '時間が緩やかに流れるような静けさと解放感', '心を落ち着かせる癒しの波動', '夢のようなテクスチャと深い余白の音空間', '日常の喧騒を忘れさせる幻想的なムード'],
    scene: '瞑想・ヨガ動画、ASMR、睡眠用コンテンツ、自然映像、宇宙や深海をテーマにした映像作品に最適です。集中力を高めたい作業・勉強BGMや、リラクゼーション系のポッドキャスト、スパ・エステ系コンテンツにも幅広く使用されています。',
    instruments: 'シンセパッド、テクスチャサウンド、環境音が幾重にも重なり合い、',
  },
  cinematic: {
    mood: ['映画のワンシーンを想起させる壮大なスケール感', '感情を揺さぶるオーケストラの重厚な厚み', '物語の深みを増す情緒的な音世界', '引き込まれるような緊張感と解放感の連続', 'ヒーローの誕生を予感させる高揚感'],
    scene: '映像制作・映画・ドキュメンタリー・企業プレゼン動画に最適です。YouTube動画のオープニングやエンディング、ゲームのトレーラー映像、感動的なストーリー系コンテンツのBGMとしても非常に人気があります。スポーツドキュメンタリーや旅行映像とも相性抜群です。',
    instruments: 'ストリングスセクション、ブラス、パーカッション、ピアノが絡み合い、',
  },
  'lo-fi': {
    mood: ['ほどよく歪んだローファイの心地よい質感', '懐かしさと温もりが混ざり合うレトロなトーン', '静かな夜に寄り添うチルアウトな空気感', '集中力を自然に高めるグルーヴと余白', 'ビニールレコードを思わせるアナログの温かみ'],
    scene: '勉強・作業・集中用BGM動画、ゲーム実況のBGM、ライブ配信のBGM、読書・読み聞かせ動画、日常Vlogに最適です。「Lo-Fi Hip Hop」スタイルのコンテンツや、リラックス系配信で特に需要が高いジャンルです。カフェ系コンテンツや夜の作業配信にも最適です。',
    instruments: 'チルなビート、柔らかなピアノ、アナログ質感のテクスチャ、ヴァイナルノイズ、',
  },
  lofi: {
    mood: ['ほどよく歪んだローファイの心地よい質感', '懐かしさと温もりが混ざり合うレトロなトーン', '静かな夜に寄り添うチルアウトな空気感', '集中力を自然に高めるグルーヴと余白', 'ビニールレコードを思わせるアナログの温かみ'],
    scene: '勉強・作業・集中用BGM動画、ゲーム実況のBGM、ライブ配信のBGM、読書・読み聞かせ動画、日常Vlogに最適です。「Lo-Fi Hip Hop」スタイルのコンテンツや、リラックス系配信で特に需要が高いジャンルです。',
    instruments: 'チルなビート、柔らかなピアノ、アナログ質感のテクスチャ、',
  },
  pop: {
    mood: ['明るく弾むようなポジティブエネルギー', 'キャッチーで耳に残る爽快なメロディライン', '聴く人の気分を上げる軽快なリズムと解放感', '誰もが親しみやすいフレンドリーなサウンド', '一度聴いたら忘れられない中毒性のあるフック'],
    scene: 'YouTube日常Vlog、料理・グルメ動画、ファッション・ライフスタイル動画、商品紹介・PR動画に最適です。TikTokやInstagram Reels向けの短尺動画BGMとしても非常に人気が高く、幅広い年代に受け入れられるサウンドです。旅行Vlogや日常系コンテンツとも相性抜群です。',
    instruments: 'キャッチーなシンセ、グルーヴィーなベース、軽快なドラムビート、明るいコード、',
  },
  'j-pop': {
    mood: ['きらめく青春のエネルギーと情感', '心に刺さるJ-Popならではの感情的な表現力', '疾走感とドラマ性が共存するメロディ展開', '日本語の情緒とポップスの融合が生む唯一無二の質感', '聴くたびに勇気や元気をもらえる高揚感'],
    scene: 'アニメ・ゲーム系YouTube動画、J-Pop系配信コンテンツ、日本のライフスタイルVlog、青春・学校シーンを描いた映像作品に最適です。日本的な感性を大切にしたコンテンツクリエイターや、J-Popファンに向けたコンテンツで特に人気があります。',
    instruments: 'キラキラしたシンセリード、パワフルなギター、エネルギッシュなドラム、甘いコーラス、',
  },
  'k-pop': {
    mood: ['洗練されたK-Popならではのスタイリッシュな輝き', 'パワフルかつセンシュアルなビートの中毒性', '都会的でグローバルに通用するモダンなムード', '聴く人を引き込むエネルギッシュで計算された展開', '完璧な音楽プロダクションが生み出す圧倒的なクオリティ'],
    scene: 'K-POP・韓国カルチャー系コンテンツ、ダンス動画、ファッション・ビューティ動画、SNSショート動画に最適です。TikTok・YouTube Shorts・Instagram Reelsのトレンドに乗せたコンテンツ制作に特に支持されています。韓流ドラマ紹介やK-Beauty系動画にも幅広く活用されています。',
    instruments: '現代的なシンセサイザー、トレンディなビートプログラミング、パンチのあるサウンドデザイン、',
  },
  electronic: {
    mood: ['未来的でクールなデジタルサウンドの洗練感', 'テクノロジーを感じるエレクトロニックな質感と躍動感', 'エネルギッシュかつスタイリッシュな音の展開', '都会的でモダンなシンセグルーヴの快感', '聴く人の感覚を刺激するビルドアップと解放'],
    scene: 'ゲーム実況・実況プレイ動画、テクノロジー・ガジェット系YouTube、DJ・クラブ系コンテンツ、スポーツ・ハイライト映像に最適です。ダイナミックな映像表現や、近未来をテーマにした映像作品にも広く活用されています。モーションデザイン系コンテンツとも相性抜群です。',
    instruments: 'シンセリード、エレクトロニックビート、アルペジエーター、レイヤードシンセパッド、',
  },
  rock: {
    mood: ['疾走感と力強さが溢れるロックの純粋なエネルギー', 'アドレナリンが上がるパワフルなグルーヴと迫力', '反骨心と自由を象徴するエレキギターの咆哮', '聴く人を鼓舞する熱いバンドアンサンブル', '生演奏ならではの躍動感とリアルな迫力'],
    scene: 'スポーツ・アクション動画、ゲーム実況・ゲームトレーラー、YouTube動画のOPやエンディング、ダイジェスト映像・ハイライトに最適です。エネルギッシュなコンテンツや、視聴者を興奮させたい場面のBGMとして特に人気があります。スケボー・サーフィン・BMXなどアクティブスポーツ映像にも最適です。',
    instruments: 'パワフルな歪みギター、重厚なベースライン、ダイナミックなドラムフィル、',
  },
  'folk-acoustic': {
    mood: ['温かな手触りのアコースティックサウンドの誠実さ', '自然体で素直な感情表現と人間的な温もり', '懐かしさと穏やかさが共存するノスタルジックな世界観', '心に染み入る弦楽器の柔らかな響きと余韻', '聴く人の心を解きほぐすオーガニックな質感'],
    scene: '旅行・自然Vlog、料理・手作りクラフト動画、田舎暮らし・スローライフ系コンテンツ、ポッドキャストのBGMに最適です。心温まるストーリーを持つコンテンツや、感情に訴える映像作品との相性も抜群です。ウェディング・記念日動画や家族向けコンテンツにも広く活用されています。',
    instruments: 'アコースティックギター、温かなフィドル、穏やかなパーカッション、ウッドベース、',
  },
  'hip-hop-rnb': {
    mood: ['ヘッドノッドが止まらないグルーヴ感と中毒性', 'スムーズでソウルフルなR&Bのムードと深み', 'ストリートカルチャーを体現するヒップホップの本質', '深く刻まれるビートの快感と心地よいスウィング感', '都会的なクールさとソウルフルな感情表現の共存'],
    scene: 'ゲーム実況・ストリーミング配信のBGM、ダンス動画・振り付け動画、ファッション・ライフスタイル系YouTube、SNSショート動画に最適です。都会的なムードを演出したいコンテンツや、スタイリッシュな映像表現に幅広く活用されています。バスケットボールやストリートカルチャー系映像にも最適です。',
    instruments: 'サンプリングビート、グルーヴィーなベースライン、ソウルフルなチョップサンプル、クラップ、',
  },
  childrens: {
    mood: ['子どもの心に響く無邪気で純粋な明るさ', 'ワクワクとドキドキが詰まった可愛らしいサウンド', '笑顔が自然とこぼれる楽しくてハッピーなメロディ', 'お子さまにとって安心できる温かで優しい音色', '親子で一緒に楽しめるほのぼのとした世界観'],
    scene: '子供向けYouTube動画、幼児向け教育コンテンツ、絵本の読み聞かせ動画、キッズ向けゲーム・アプリのBGMに最適です。保育園・幼稚園での発表会映像や、子どものお祝いシーン、家族向けVlogにも広く活用されています。知育・学習系コンテンツとも相性抜群です。',
    instruments: '可愛らしい木琴やグロッケンシュピール、明るいピアノ、弾むパーカッション、',
  },
  'japanese-anime': {
    mood: ['胸が熱くなるアニメ王道の感動と高揚感', '疾走感と熱量が止まらないオープニング的な開放感', '主人公の成長と葛藤を描く熱血系サウンドの力強さ', '世界観に一気に引き込まれるドラマチックな音の展開', '日本アニメ独自の情緒とパワフルな迫力の融合'],
    scene: 'アニメ系YouTube・MAD動画、ゲーム実況・RPGコンテンツ、コスプレ・ファン動画、YouTube動画のオープニングに最適です。熱い展開のある映像作品や、視聴者を一気に引き込みたいコンテンツのBGMとして特に人気があります。バトル系ゲーム実況や格闘技映像にも最適です。',
    instruments: 'ダイナミックなストリングス、パワフルなギター、アニメらしいシンセ、力強いドラム、',
  },
  'corporate-bgm': {
    mood: ['プロフェッショナルな信頼感と落ち着いた品格', '洗練されたビジネスシーンに相応しい格調の高さ', '前向きで意欲的なポジティブエネルギーの発散', '聴く人に安心感を与えるクリーンで清潔なサウンド', '誠実さと知性を感じさせる上品で洗練されたムード'],
    scene: '企業VP・会社紹介動画、プレゼンテーション・セミナー映像、採用動画・インタビュー映像、ニュース・情報番組系コンテンツに最適です。ビジネス系ポッドキャストや、プロフェッショナルな印象を与えたい全てのコンテンツに広く活用されています。ウェビナーや展示会映像にも最適です。',
    instruments: 'クリーンなアコースティックギター、穏やかなストリングス、洗練されたピアノ、',
  },
  wafu: {
    mood: ['日本の美意識を凝縮した雅で幽玄なサウンド', '和楽器が紡ぎ出す深い情緒と侘び寂びの精神', '四季折々の日本の情景を鮮やかに想起させる音色', '伝統と現代が融合した新しい和のサウンドの輝き', '日本人の魂に直接訴えかける懐かしくも新しい音世界'],
    scene: '日本文化・和食・茶道系YouTube、旅行Vlog（京都・奈良・日本各地）、和菓子・日本料理紹介動画、インバウンド向けコンテンツに最適です。神社・仏閣の映像や、伝統工芸を紹介するコンテンツ、和風ゲームのBGMとも相性抜群です。',
    instruments: '琴・尺八・三味線などの和楽器、雅な打楽器、繊細な弦の響き、',
  },
  horror: {
    mood: ['背筋が凍るような恐怖の静寂と不穏な緊張感', '暗闇の中に蠢く何かを感じさせる不気味なサウンド', '心臓の鼓動が速まる極限まで高められたスリリングな展開', '恐怖体験を最大化するダークアンビエントの深淵', '逃げ場のない閉塞感と薄明かりの恐怖が交差する音世界'],
    scene: 'ホラーゲーム実況、怖い話・都市伝説系YouTube、ハロウィンコンテンツ、ミステリー・サスペンス系映像作品に最適です。脱出ゲーム・謎解き動画や、怪談・心霊系ポッドキャストのBGMとしても高い人気を誇ります。ホラー映画予告編やダーク系映像制作にも活用されています。',
    instruments: '不協和音のストリングス、ダークアンビエントパッド、不気味なパーカッション、',
  },
  other: {
    mood: ['ジャンルの枠を超えた個性的で独創的なサウンド', '新鮮な驚きをもたらすユニークな音世界の広がり', '様々なシーンに対応できる高い多様性と柔軟性', 'クリエイターの想像力を刺激する自由で実験的な表現', '他にはない独特の雰囲気と存在感を持つ楽曲'],
    scene: 'YouTube動画・映像制作全般、ゲーム実況・ライブ配信BGM、各種SNS動画（TikTok・Instagram・X）に最適です。既存ジャンルに縛られない独創的なコンテンツや、特別なシーンのBGMとして活用されています。ショートフィルムや実験的な映像表現にも最適です。',
    instruments: '多彩な楽器の組み合わせ、独自のサウンドデザイン、',
  },
};

// ── BPM別テンポ説明 ──────────────────────────────────────
function tempoDesc(bpm) {
  if (!bpm) return 'テンポは落ち着いており、';
  if (bpm < 70)  return `BPM ${Math.round(bpm)}のゆったりとしたスローテンポで、`;
  if (bpm < 90)  return `BPM ${Math.round(bpm)}のゆるやかなテンポで、`;
  if (bpm < 110) return `BPM ${Math.round(bpm)}のミディアムテンポで、`;
  if (bpm < 130) return `BPM ${Math.round(bpm)}のやや速めのテンポで、`;
  if (bpm < 150) return `BPM ${Math.round(bpm)}のアップテンポで、`;
  if (bpm < 180) return `BPM ${Math.round(bpm)}の疾走感あるテンポで、`;
  return `BPM ${Math.round(bpm)}の非常に速いテンポで、`;
}

// ── 曲尺別説明 ────────────────────────────────────────────
function durDesc(sec) {
  if (!sec) return '';
  if (sec < 60)  return `${Math.floor(sec)}秒という印象的な楽曲で、`;
  if (sec < 90)  return `約${Math.floor(sec)}秒のコンパクトな構成で、`;
  if (sec < 120) return `${Math.floor(sec / 60)}分${Math.floor(sec % 60)}秒のテンポよい展開で、`;
  if (sec < 180) return `${Math.floor(sec / 60)}分${Math.floor(sec % 60)}秒のバランスよい尺で、`;
  if (sec < 300) return `${Math.floor(sec / 60)}分${Math.floor(sec % 60)}秒のしっかりとした尺で、`;
  return `${Math.floor(sec / 60)}分${Math.floor(sec % 60)}秒の長尺で、`;
}

// ── スラグベースの決定論的選択 ─────────────────────────────
function pickBySlug(arr, slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

// ── リッチ解説生成（~1,000字） ────────────────────────────
function buildRichDesc(song) {
  const slug  = song.slug || song.id || '';
  const title = song.title || slug;
  const gJa   = GENRE_JA[song.genre] || song.genre || 'BGM';
  const desc  = song.description || '';
  const tags  = (song.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const gd    = GENRE_DATA[song.genre] || GENRE_DATA.other;

  const mood  = pickBySlug(gd.mood, slug);
  const tempo = tempoDesc(song.bpm);
  const dura  = durDesc(song.duration);
  const tagKw = tags.slice(0, 4).join('、');

  // 段落1: 曲の魅力・情景（~230字）
  const descText = desc
    ? (desc.endsWith('。') || desc.endsWith('．') || desc.endsWith('…') ? desc : `${desc}。`)
    : '';
  const p1 = `「${title}」は、${gJa}ジャンルの${mood}が特徴の無料BGM楽曲です。${descText ? `${descText}` : ''}${tempo}${dura}聴く人の感情に自然に寄り添い、映像・配信・動画制作のあらゆる場面で活躍する一曲です。ループ再生にも対応しており、長時間の動画BGMとしてもご利用いただけます。`;

  // 段落2: サウンド特徴（~230字）
  const p2 = `サウンドの特徴として、${gd.instruments}全体のアレンジが${gJa}らしい独自の世界観を形作っています。${tagKw ? `「${tagKw}」といったキーワードで表現されるサウンドは、` : 'このサウンドは、'}プロのトラックメイカーが精密に設計したBGMとして、映像のクオリティを一段引き上げる効果があります。音量バランスとダイナミクスも動画用に最適化済みで、エンコード後もクリアなサウンドを保ちます。`;

  // 段落3: 使用シーン（~280字）
  const p3 = `${gd.scene}無音になりがちなシーンへの挿入や、動画全体を通したBGMとしても長さが最適化されています。YouTubeの収益化にも対応しており、著作権申請の心配なく安心してご利用いただけます。`;

  // 段落4: ライセンス（~190字）
  const p4 = `本楽曲は完全無料でダウンロードでき、商用・非商用を問わずご利用いただけます。YouTube・TikTok・Instagram・ニコニコ動画・ゲーム・アプリ・ウェブサイト等、あらゆる媒体でクレジット表記なしにご利用いただけます。利用登録・事前申請は不要です。詳細は「日本一フリーBGM」利用規約をご確認ください。`;

  return { p1, p2, p3, p4 };
}

// ── meta description 最適化（~160字） ──────────────────────
function buildMetaDesc(song) {
  const title = song.title || song.slug || '';
  const gJa   = GENRE_JA[song.genre] || song.genre || 'BGM';
  const desc  = song.description || '';
  const bpm   = song.bpm ? `BPM${Math.round(song.bpm)}` : '';
  const dur   = song.duration
    ? `${Math.floor(song.duration / 60)}分${Math.floor(song.duration % 60)}秒`
    : '';
  const core  = desc.slice(0, 55);
  const meta  = `「${title}」${gJa}の無料BGM。${core}${desc.length > 55 ? '…' : ''}${bpm ? ` ${bpm}` : ''}${dur ? `・${dur}` : ''}。商用利用OK・登録不要・クレジット不要。日本一フリーBGMより配布。`;
  return meta.slice(0, 160);
}

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
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `PT${m}M${s}S`;
}

// ── 運営者コメント（曲ごとに一意） ────────────────────────
const CURATOR_TEMPLATES = {
  jazz: [
    t => `「${t}」を作るとき、深夜のカフェで誰かが静かに仕事をしている風景を思い浮かべていました。BGMって「気づいたら流れている」くらいがちょうどいいと思っています。`,
    t => `ジャズは個人的に最も好きなジャンルです。「${t}」はその中でも特に気に入っている一曲で、動画の雰囲気をさりげなく底上げしてくれる力があると感じています。`,
    t => `料理動画やインタビュー映像には、お洒落でうるさくないBGMが意外と少ないと感じていました。「${t}」はまさにそのニーズから生まれた一曲です。`,
    t => `「${t}」のような落ち着いたジャズって、聴き流せるようで実はちゃんと「聴かせる」んですよね。そのバランスをいちばん大切にしました。`,
    t => `夜、ひとりでコーヒーを飲みながら作業するとき──そんな時間のそばに置きたい音を目指しました。「${t}」が誰かのそういう時間に寄り添えたらうれしいです。`,
    t => `「${t}」はシンプルにかっこいい動画を作りたい人のために作りました。お洒落な映像と合わせると、それだけで映像の格が上がる気がします。`,
    t => `いわゆる「ジャズっぽい曲」はたくさんありますが、動画BGMとして本当に使いやすいものはなかなかない。「${t}」はその使い勝手を特に意識して仕上げた一曲です。`,
    t => `映像の空気感って、BGM次第で全然変わりますよね。「${t}」を聴いたとき、これは使える、と直感的に感じました。ぜひ試してみてください。`,
  ],
  ambient: [
    t => `何も考えずにただ流しておける曲が欲しいという気持ちから、「${t}」は生まれました。作業の邪魔にならず、でも無音より断然いい──そういう曲を目指しています。`,
    t => `アンビエント系の曲って、使う人の創造性を引き出すような余白が大切だと思っています。「${t}」はその「余白」を意識して作った一曲です。`,
    t => `睡眠用コンテンツやASMR動画に使えるBGMが意外と少ないと感じていました。「${t}」はそのギャップを埋めるために作った曲のひとつです。`,
    t => `「${t}」は、静かに集中したい時間のためのBGMです。流しながら作業していると、自然と深い集中状態に入れる──そんな効果を狙っています。`,
    t => `自然映像や瞑想動画を作る方に、ぜひ使ってほしい一曲です。「${t}」には、日常の喧騒から少し離れたような静けさを込めました。`,
    t => `アンビエントって地味に見えて、実は映像の「持ち時間」を長くする力があると思っています。「${t}」はまさにそういう役割の曲です。`,
    t => `「${t}」を作っているとき、ふと宇宙の広さを思い浮かべました。壮大なテーマにも日常の小さな動画にも、不思議と馴染む曲だと思います。`,
    t => `リラックス系コンテンツを作る人にとって、信頼できるアンビエントBGMの選択肢が増えてほしいと思っています。「${t}」がそのひとつになれればうれしいです。`,
  ],
  cinematic: [
    t => `「${t}」を聴くたびに映画の予告編を思い出します。ドラマチックな映像と合わせると、それだけで作品の格が上がるような曲を目指しました。`,
    t => `シネマティックな曲って、「感情を動かす」のが仕事だと思っています。「${t}」はその点を特に意識して仕上げた一曲です。`,
    t => `企業プロモ動画やYouTubeのオープニングに使いたい壮大なBGMが、なかなかフリーで見つからない──そんな声を何度も聞いていました。「${t}」はそのニーズに応えるために作りました。`,
    t => `「${t}」には、物語の始まりを感じさせる高揚感を込めました。動画を見始めた瞬間に「何か始まる」という期待感を与えられる曲だと思っています。`,
    t => `スポーツのダイジェスト映像や感動系コンテンツを作る人に届けたい一曲です。「${t}」が誰かの代表作のBGMになれたらうれしいです。`,
    t => `「${t}」のような壮大な曲は、それ自体がひとつのストーリーだと思っています。映像がなくても世界観が伝わる──そういう強さを目指しました。`,
    t => `旅行映像やドキュメンタリー動画を作る方に、自信を持っておすすめできる一曲です。「${t}」は映像の「格」を上げてくれる力があると思います。`,
  ],
  'lo-fi': [
    t => `Lo-Fiってなんであんなに集中できるんでしょうね。「${t}」はその心地よさを徹底的に追求した一曲です。勉強や作業のお供にどうぞ。`,
    t => `「${t}」は、長時間流し続けても疲れない曲を目指して作りました。ループ再生で使っていただくのが特におすすめです。`,
    t => `ゲーム実況や配信のBGMって、主役の邪魔をしないことが大事だと思っています。「${t}」はそのバランスをいちばん大切にしました。`,
    t => `アナログな温かみのあるサウンドが好きで、「${t}」にはその質感を込めました。ビニールレコードを思わせるあの雰囲気、好きな方に刺さると思います。`,
    t => `「${t}」を作るとき、深夜の勉強部屋をイメージしていました。誰かの集中している時間のそばで、静かに流れていてほしい曲です。`,
    t => `Lo-Fiのゆるさって、聴く人の緊張を自然にほぐす力がある気がします。「${t}」はそういう「リラックスのお手伝い」ができる曲だと思っています。`,
    t => `カフェ系コンテンツや読書動画に合うBGMを探している方に、自信を持っておすすめできます。「${t}」はそういう雰囲気にぴったりです。`,
  ],
  lofi: [
    t => `「${t}」のようなチルな曲って、映像に乗せると想像以上に効果的なんですよね。ぜひいろんな動画で試してみてください。`,
    t => `長時間流しても疲れない、それがLo-Fiの強みだと思います。「${t}」はまさにそういう「疲れない曲」を意識して作りました。`,
    t => `「${t}」を作るとき、雨の降る窓際でコーヒーを飲んでいる絵を思い浮かべていました。そういう時間のBGMになれたらうれしいです。`,
    t => `配信や実況のバックグラウンドで流せるBGMって意外と選択肢が少なくて。「${t}」はそのニーズから生まれた一曲です。`,
    t => `Lo-Fiは聴き手の集中を邪魔しないけれど、確実に「そこにいる」感じがする──そのバランスを「${t}」でも大切にしました。`,
    t => `アナログっぽいあの質感、好きな人には本当に刺さりますよね。「${t}」はそこにこだわって仕上げた一曲です。`,
    t => `勉強や作業中に流してほしい一曲です。「${t}」が誰かの集中時間をそっと支えられたらうれしいです。`,
  ],
  pop: [
    t => `「${t}」は、聴いた人が思わず明るい気持ちになれる曲を目指しました。日常Vlogや商品紹介動画に使うと、映像全体が明るくなると思います。`,
    t => `ポップな曲って、ターゲットを選ばない強さがありますよね。「${t}」はまさにそういう「誰にでも届く」一曲です。`,
    t => `TikTokやInstagramのショート動画に使えるキャッチーなBGMがもっと欲しいと感じていました。「${t}」はそのニーズから生まれた曲です。`,
    t => `「${t}」を作るとき、友達と一緒に楽しい時間を過ごしているシーンを思い浮かべていました。そういう映像にぴったりな曲だと思います。`,
    t => `明るくて使いやすいBGMって、実は作るのが一番難しいと感じています。「${t}」はその難しさに正面から向き合った一曲です。`,
    t => `料理動画やファッションコンテンツに合うポップなBGMが少ないと感じていました。「${t}」はそのジャンルのクリエイターに届けたい曲です。`,
    t => `「${t}」のような曲って、動画全体の「体温」を上げてくれる気がします。視聴者が思わず笑顔になるような、そんな効果を狙っています。`,
  ],
  'j-pop': [
    t => `「${t}」には、日本のポップスならではの情感を込めました。アニメ系やライフスタイル系コンテンツを作る方にぜひ試してほしい一曲です。`,
    t => `J-Popって、メロディに感情が乗る密度が高い気がして、そこが好きなんですよね。「${t}」はその「感情の密度」を大切にしました。`,
    t => `日本的な感性を大切にしたコンテンツを作る方に届けたい一曲です。「${t}」には、J-Popらしいドラマ性を詰め込みました。`,
    t => `「${t}」を作るとき、青春時代の思い出と現在が重なるような、そんな情緒を意識しました。切なさと前向きさが共存する曲になっていると思います。`,
    t => `疾走感があってドラマチックな曲が欲しいという声をよく聞きます。「${t}」はまさにそういうニーズに応えた一曲です。`,
    t => `ゲーム系やアニメ系の動画を作る方に、特に使ってほしい曲です。「${t}」はそのジャンルの映像と相性抜群だと思っています。`,
    t => `J-Popならではのキラキラした高揚感──「${t}」ではその部分を特に大切にしました。聴いた人の気持ちが自然と上がる曲になっていると思います。`,
  ],
  'k-pop': [
    t => `K-POPって、音楽プロダクションのクオリティが本当に高くて、それを参考にしながら「${t}」を作りました。スタイリッシュな映像に合わせてほしい曲です。`,
    t => `「${t}」はダンス動画やファッション系コンテンツのために作りました。トレンド感のあるサウンドで、SNS映えする映像に仕上がると思います。`,
    t => `グローバルに通用するモダンなサウンドを目指しました。「${t}」は韓流コンテンツだけでなく、スタイリッシュな映像全般に使ってほしい一曲です。`,
    t => `K-POPのエネルギーってすごいですよね。「${t}」にはそのエネルギーをBGMとして映像に取り込んでほしいという気持ちを込めています。`,
    t => `TikTokやYouTube Shortsのような短尺動画のBGMとして、「${t}」は特に効果的だと思っています。最初の数秒で引き込む力がある曲です。`,
    t => `K-Beauty系やK-Culture系のコンテンツを作る方に、ぜひ使ってほしい一曲です。「${t}」はそういうコンテンツの世界観をぐっと引き上げてくれると思います。`,
    t => `「${t}」を作るとき、完璧に磨かれたステージパフォーマンスを思い浮かべていました。そのクオリティ感を音楽で表現できていたらうれしいです。`,
  ],
  electronic: [
    t => `ゲーム実況やテクノロジー系コンテンツに合うBGMが意外と少ないと感じていました。「${t}」はまさにそのニーズから生まれた一曲です。`,
    t => `「${t}」には、未来的でクールなサウンドへのこだわりを込めました。モダンな映像と合わせると、そのスタイリッシュさが倍増すると思います。`,
    t => `エレクトロニックな曲って、エネルギーの「放出」と「溜め」のバランスが大切だと思っています。「${t}」はそのダイナミクスを特に意識しました。`,
    t => `「${t}」を作るとき、都会の夜景と高速で流れる映像を思い浮かべていました。そういうシーンのBGMにぴったりだと思います。`,
    t => `スポーツハイライトやモーションデザイン系の映像に合うBGMを探している方に届けたい一曲です。「${t}」はそういう映像の勢いをさらに引き上げてくれます。`,
    t => `電子音楽の可能性って本当に広くて、探れば探るほど面白い。「${t}」はその探求から生まれた一曲で、使う映像によって全然違う顔を見せてくれると思います。`,
    t => `「${t}」はDJセットやクラブ系コンテンツだけでなく、ゲームやスポーツ動画にも幅広く使えます。そのフレキシビリティを意識して作りました。`,
  ],
  rock: [
    t => `「${t}」を作るとき、アドレナリンが上がる瞬間のことを考えていました。スポーツやアクション系の映像と合わせると、その迫力がさらに増すはずです。`,
    t => `ロックの「生演奏感」ってエネルギーが違いますよね。「${t}」はそのライブ感と躍動感をできる限り再現した一曲です。`,
    t => `ゲームトレーラーやスポーツダイジェスト映像に使える、本当に「使える」ロックBGMが少ないと感じていました。「${t}」はそのニーズに応えるために作りました。`,
    t => `「${t}」には、視聴者を鼓舞するパワーを込めました。オープニング映像やハイライトシーンに使うと、その場の熱量が上がると思います。`,
    t => `エレキギターの歪みって、映像に乗せると本当に映えるんですよね。「${t}」はそのギターサウンドをフィーチャーした一曲です。`,
    t => `「${t}」のような曲って、映像に使うだけで視聴者の心拍数が上がる気がします。そういう「映像を加速させる」力のある曲を目指しました。`,
    t => `アクティブスポーツや挑戦・克服をテーマにした動画に使ってほしい一曲です。「${t}」はそういう映像と合わせると本領発揮すると思います。`,
  ],
  'folk-acoustic': [
    t => `「${t}」のような生楽器の温かさって、デジタルな音楽にはない誠実さがありますよね。その質感を大切に仕上げた一曲です。`,
    t => `旅行Vlogや日常の小さな幸せを切り取った映像に、ぜひ使ってほしい曲です。「${t}」はそういう映像の温かさをさらに引き立ててくれると思います。`,
    t => `アコースティックな曲って、聴く人の心をほぐす力があると思っています。「${t}」はそのやさしさをいちばん大切にして作りました。`,
    t => `「${t}」を作るとき、自然の中で誰かが静かにギターを弾いている風景を思い浮かべていました。そういう映像のそばに置いてほしい曲です。`,
    t => `料理動画や手仕事・DIY系コンテンツに合うBGMって意外と少なくて。「${t}」はそういう映像の「作る喜び」を引き立てる曲になればと思っています。`,
    t => `フォーク系のBGMって、歌詞がなくても「物語」が見える気がするんですよね。「${t}」もそういうナラティブな音楽になれたらうれしいです。`,
    t => `シンプルで素直な音楽が持つ強さを、「${t}」で表現できたと思っています。ドキュメンタリーや日常系Vlogのお供にどうぞ。`,
  ],
  'hip-hop-rnb': [
    t => `「${t}」は、都会的でクールな映像を作りたい人のために作りました。ヒップホップならではのグルーヴ感が映像全体を引き締めてくれると思います。`,
    t => `R&Bのなめらかなグルーヴって、映像に乗せると本当に気持ちいいですよね。「${t}」はその心地よさを特に大切にした一曲です。`,
    t => `「${t}」を作るとき、夜の街をゆっくり歩いているような感覚を意識しました。そういうムードの映像に使ってほしい曲です。`,
    t => `ライフスタイル系やファッション系の動画に合うヒップホップBGMが少ないと感じていました。「${t}」はそのニーズから生まれた一曲です。`,
    t => `トラップ系のビートって、映像に乗せると意外なほど汎用性が高いと思っています。「${t}」もいろんなシーンで試してみてください。`,
    t => `「${t}」には、自分らしくあることへのリスペクトを込めました。クリエイターとして信念を持って作ったコンテンツと一緒に流してほしい曲です。`,
    t => `ビートの中毒性って、繰り返し聴いてもらえる力がありますよね。「${t}」はそのリピート性を特に意識して作りました。`,
  ],
  childrens: [
    t => `子供向けコンテンツを作る方に、安心して使ってもらえる明るいBGMを届けたいと思っています。「${t}」はそういう気持ちから生まれた一曲です。`,
    t => `「${t}」を作るとき、子供が笑顔になるような音楽って何だろうとずっと考えていました。その答えのひとつがこの曲です。`,
    t => `教育系コンテンツや読み聞かせ動画に合うBGMって、意外と選択肢が少なくて。「${t}」はそのニーズに正面から応えた曲です。`,
    t => `「${t}」のような曲は、子供も大人も一緒に楽しめる動画のBGMに最適だと思っています。ファミリー向けコンテンツにぜひ使ってください。`,
    t => `子供向けのBGMって、大人が作るとどうしても「それっぽくなりすぎる」ことがある。「${t}」では自然な楽しさを大切にしました。`,
    t => `「${t}」は、幼稚園・保育園向けコンテンツや習い事の紹介動画にも使ってもらえるよう、明るくて温かいサウンドを意識しました。`,
    t => `子供向けアニメや工作・お絵かき系の動画に使ってほしい曲です。「${t}」が誰かの大切なコンテンツに彩りを添えられたらうれしいです。`,
  ],
  'japanese-anime': [
    t => `「${t}」は、アニメや日本文化が好きな人のために作りました。そういうコンテンツを作るクリエイターにとって頼れる一曲になってほしいと思っています。`,
    t => `アニメ系のBGMって、世界観を一瞬で伝える力がありますよね。「${t}」はそのパワーを意識して作った一曲です。`,
    t => `「${t}」を作るとき、好きなアニメのOPシーンを頭の中で何度も再生していました。そういう高揚感のある映像のそばに置いてほしい曲です。`,
    t => `ゲーム実況やアニメレビュー系の動画に使えるBGMが意外と少ないと感じていました。「${t}」はそのニーズから生まれた一曲です。`,
    t => `日本のポップカルチャーを愛するクリエイターに届けたい曲です。「${t}」はそういう文化への愛着を音楽で表現したものです。`,
    t => `「${t}」のようなアニソン系の曲って、聴く人の心にダイレクトに届く強さがある気がします。その感情を動かす力を大切にしました。`,
    t => `ボーカロイド系やアニメMV風の映像を作る方に、ぜひ使ってほしい一曲です。「${t}」はそういう映像の世界観を強化してくれると思います。`,
  ],
  wafu: [
    t => `「${t}」を作るとき、日本の美しい四季と伝統的な空間を思い浮かべていました。和の世界観を映像で表現したい方にぴったりの曲です。`,
    t => `和風BGMって、海外のクリエイターにも喜ばれることが多くて。「${t}」はグローバルに通用する和の美しさを意識して作りました。`,
    t => `「${t}」には、日本の伝統的な楽器が持つ独特の余白感を込めました。祭りや神社の映像、和食の動画にぴったりです。`,
    t => `和の雰囲気を動画に取り入れたいけれど、ちょうどいいBGMが見つからない──そういう方に届けたい一曲です。「${t}」がその答えになれれば。`,
    t => `「${t}」を作るとき、障子越しに入る柔らかい光と、静かに流れる川の音を思い浮かべていました。そういう静謐な映像のそばに置いてほしい曲です。`,
    t => `日本文化を紹介するコンテンツや、和テイストのゲームBGMを探している方に、自信を持っておすすめできます。「${t}」はそのニーズにしっかり応えています。`,
    t => `和楽器の音って、聴く人の心を落ち着かせる力がありますよね。「${t}」はそのやさしさと力強さの両方を大切にした一曲です。`,
  ],
  horror: [
    t => `「${t}」を作るとき、深夜に一人で観るホラー映画の緊張感を再現しようとしていました。そういう映像の雰囲気をさらに高めてくれる曲だと思います。`,
    t => `ホラー系のBGMって、音の「隙間」が怖さを生むと思っています。「${t}」はそのサイレンスの使い方にこだわった一曲です。`,
    t => `怖い映像を作るとき、BGMが「怖さの主役」になりすぎないことが大切だと思っています。「${t}」は映像を引き立てる「怖さの脇役」を目指しました。`,
    t => `「${t}」は、ホラーゲームの実況やミステリー系コンテンツのBGMとして特に効果的だと思っています。視聴者の緊張感を高める効果があります。`,
    t => `ダーク系やスリラー系の映像を作る方に届けたい曲です。「${t}」は見る人の想像力を刺激する、そういう力のある曲を目指しました。`,
    t => `「${t}」のような暗くて不気味な曲って、使いどころが難しいようで実は意外と汎用性がある。映像の緊張感を高めたいあらゆるシーンで試してほしいです。`,
    t => `怪談系やオカルト系の動画を作るクリエイターに、ぜひ使ってほしい一曲です。「${t}」はそういうコンテンツの世界観をぐっと引き締めてくれます。`,
  ],
  'corporate-bgm': [
    t => `「${t}」は、企業プロモーションや採用動画に使えるプロフェッショナルなBGMとして作りました。信頼感と前向きさを同時に伝えられる曲です。`,
    t => `コーポレート系の映像って、BGMが「信頼感」を左右しますよね。「${t}」はその点をいちばん意識して仕上げた一曲です。`,
    t => `「${t}」を作るとき、プレゼンの場でスライドが切り替わる瞬間の緊張感と期待感を思い浮かべていました。そういう映像に自然に馴染む曲です。`,
    t => `企業のウェブCMやサービス紹介動画に使えるBGMって、意外とフリーで見つからないんですよね。「${t}」はそのニーズに応えるために作りました。`,
    t => `「${t}」のようなコーポレート系BGMって、主張しすぎず、でも確実に映像の品質を上げてくれます。そのバランスを特に大切にしました。`,
    t => `ドキュメンタリーや解説系YouTube動画のBGMとして、「${t}」は特に効果的だと思っています。内容の信頼性を高める効果があります。`,
    t => `会社紹介や採用広報の映像を作る担当者の方に届けたい曲です。「${t}」がその大切な動画のクオリティを上げる一助になれれば。`,
  ],
  other: [
    t => `「${t}」は、ジャンルの枠を超えて使える汎用性の高い曲を目指して作りました。どんな映像にも不思議と馴染む曲になっていると思います。`,
    t => `「${t}」のような曲って、使い方次第で全然違う表情を見せてくれるのが面白いですよね。ぜひいろんなシーンで試してみてください。`,
    t => `映像のBGMに迷ったとき、「${t}」を一度試してみてください。意外なシーンでぴったりはまることがあると思います。`,
    t => `「${t}」は、特定のジャンルに縛られない自由な発想から生まれた曲です。作る側も使う側も、固定観念を取り払って楽しんでほしいです。`,
    t => `このサイトは「使う人のことを一番に考える」というシンプルな思いから始まりました。「${t}」もその気持ちを込めて作っています。`,
    t => `BGMって、映像の感情を倍にも半分にもする力があると思っています。「${t}」が誰かの映像の感情を豊かにしてくれたらうれしいです。`,
    t => `「${t}」は自由に使ってもらうために作った曲です。商用・非商用を問わず、思い切り使ってください。`,
  ],
};

function slugHash(slug) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (Math.imul(31, h) + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildCuratorComment(song) {
  const genre = song.genre || 'other';
  const pool  = CURATOR_TEMPLATES[genre] || CURATOR_TEMPLATES.other;
  const title = song.title || song.title_en || song.slug || '';
  const idx   = slugHash(song.slug || song.id || '') % pool.length;
  return pool[idx](title);
}

// ── ページ HTML テンプレート ──────────────────────────────
function buildPage(song) {
  const slug    = song.slug || song.id;
  const title   = song.title || slug;
  const gJa     = GENRE_JA[song.genre] || song.genre || 'BGM';
  const desc    = song.description || '';
  const tags    = (song.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const bpmStr  = song.bpm  ? `BPM ${Math.round(song.bpm)}` : null;
  const dur     = fmtDur(song.duration);
  const durISO  = fmtDurISO(song.duration);
  const imgUrl  = song.image
    ? `${R2_BASE}/${song.image}`
    : `${R2_BASE}/images/jazz/midnight-pour-over_9aaa952c.jpeg`;
  const audioUrl = song.audio ? `${R2_BASE}/${song.audio}` : null;
  const pageUrl  = `${BASE_URL}/songs/${slug}`;
  const appUrl   = `${BASE_URL}/`;

  const metaDesc = buildMetaDesc(song);
  const rich     = buildRichDesc(song);
  const metaList = [bpmStr, dur, gJa, tags.length ? tags.join(' / ') : ''].filter(Boolean).join(' | ');

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
    'creditText': '日本一フリーBGM',
    'copyrightNotice': '無料・商用利用OK・クレジット不要 / 日本一フリーBGM',
    'keywords': tags.join(', '),
    ...(song.bpm ? { 'tempo': Math.round(song.bpm) } : {}),
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
      'name': `日本一フリーBGM — ${gJa}コレクション`,
      'url': `${BASE_URL}/#genre/${song.genre || ''}`,
    },
    'publisher': {
      '@type': 'Organization',
      'name': '日本一フリーBGM',
      'url': BASE_URL,
    },
  };

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — ${esc(gJa)}フリーBGM | 日本一フリーBGM</title>
<meta name="description" content="${esc(metaDesc)}">
<meta name="keywords" content="${esc(['フリーBGM','無料BGM','商用利用可',gJa,...tags].join(','))}">
<link rel="canonical" href="${esc(pageUrl)}">

<!-- OGP -->
<meta property="og:type" content="music.song">
<meta property="og:title" content="${esc(title)} — ${esc(gJa)}フリーBGM | 日本一フリーBGM">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:image" content="${esc(imgUrl)}">
<meta property="og:site_name" content="日本一フリーBGM">
<meta property="og:locale" content="ja_JP">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)} — ${esc(gJa)}フリーBGM">
<meta name="twitter:description" content="${esc(metaDesc)}">
<meta name="twitter:image" content="${esc(imgUrl)}">

<!-- 構造化データ (MusicRecording) -->
<script type="application/ld+json">${JSON.stringify(ld, null, 0)}</script>
<!-- 構造化データ (BreadcrumbList) -->
<script type="application/ld+json">${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  'itemListElement': [
    { '@type': 'ListItem', 'position': 1, 'name': '日本一フリーBGM', 'item': BASE_URL },
    { '@type': 'ListItem', 'position': 2, 'name': gJa + 'フリーBGM', 'item': `${BASE_URL}/#genre/${song.genre || ''}` },
    { '@type': 'ListItem', 'position': 3, 'name': title },
  ]
}, null, 0)}</script>

<style>
body{font-family:'Noto Sans JP',system-ui,sans-serif;background:#faf6f0;color:#1a1008;padding:2rem 1.5rem;max-width:700px;margin:0 auto;line-height:1.7}
h1{font-size:1.6rem;font-weight:900;margin-bottom:.5rem;color:#c85a1e}
h2{font-size:1.15rem;font-weight:700;margin:0 0 .8rem;color:#8a4010;border-left:4px solid #c85a1e;padding-left:.75rem}
h3{font-size:.95rem;font-weight:700;margin:1.2rem 0 .3rem;color:#6a3008}
.badge{display:inline-block;background:#c85a1e;color:#fff;font-size:12px;font-weight:700;padding:3px 10px;border-radius:20px;margin-bottom:1rem}
.meta{font-size:13px;color:#8a7060;margin-bottom:1rem}
.tags{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:1.5rem}
.tag{font-size:12px;background:#f5ede0;border:1px solid #ddd0c0;padding:3px 10px;border-radius:14px;color:#8a7060}
.desc{font-size:14px;color:#3a2a1a;margin-bottom:1.5rem;line-height:1.9}
.player-wrap{background:#fff;border:1px solid #e8ddd0;border-radius:12px;padding:1.2rem 1.5rem;margin-bottom:1.5rem}
.player-wrap audio{width:100%;margin-bottom:.8rem;display:block}
.btn-row{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:.8rem}
.dl-btn{display:inline-block;background:#c85a1e;color:#fff;text-decoration:none;padding:10px 22px;border-radius:9px;font-weight:700;font-size:14px}
.dl-btn:hover{background:#a84812}
.open-btn{display:inline-block;background:#fff;color:#c85a1e;text-decoration:none;padding:10px 22px;border-radius:9px;font-weight:700;font-size:14px;border:2px solid #c85a1e}
.open-btn:hover{background:#fdf0e8}
.license-note{font-size:12px;color:#8a7060}
.dl-btn{cursor:pointer;border:none}
.rich-section{background:#fff8f4;border:1px solid #ead8c4;border-radius:12px;padding:1.4rem 1.5rem;margin-bottom:1.5rem}
.song-img{width:100%;height:auto;border-radius:8px;margin-bottom:1.2rem;display:block}
.rich-section p{font-size:14px;line-height:1.9;color:#2a1a0a;margin:0 0 .9rem}
.rich-section p:last-child{margin-bottom:0}
.curator-note{font-size:13px;color:#5a4030;background:#fffaf6;border-left:3px solid #c85a1e;padding:.85rem 1.1rem;border-radius:0 8px 8px 0;margin-bottom:1.4rem;line-height:1.85;font-style:italic}
.curator-note cite{display:block;margin-top:.4rem;font-style:normal;font-size:12px;color:#9a7060;font-weight:600}
.info-table{width:100%;border-collapse:collapse;margin:.5rem 0 1rem;font-size:13px}
.info-table th,.info-table td{text-align:left;padding:6px 10px;border-bottom:1px solid #ead8c4}
.info-table th{width:100px;color:#8a7060;font-weight:600;background:#fdf5ef;white-space:nowrap}
.info-table td{color:#3a2a1a}
</style>
</head>
<body>
<div class="badge">${esc(gJa)}</div>
<h1>${esc(title)}</h1>
<div class="meta">${esc(metaList)}</div>
${desc ? `<div class="desc">${esc(desc)}</div>` : ''}
${tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}

<div class="player-wrap">
${audioUrl ? `<audio controls preload="none" src="${esc(audioUrl)}"></audio>` : ''}
<div class="btn-row">
${audioUrl ? `<button class="dl-btn" onclick="dlBgm(this,'${esc(audioUrl)}','${esc(slug)}')">⬇ ダウンロード（無料）</button>` : ''}
<a class="open-btn" href="${esc(appUrl)}">▶ サイトで全曲を聴く</a>
</div>
<p class="license-note">✅ 商用利用OK・登録不要・クレジット不要 /<a href="${esc(BASE_URL)}/#license" style="color:#c85a1e;margin-left:4px">利用規約</a></p>
</div>

<aside class="curator-note">${esc(buildCuratorComment(song))}<cite>— 運営より</cite></aside>

<section class="rich-section" aria-label="楽曲解説">
  <img src="${esc(imgUrl)}" alt="${esc(title)} のイメージ" loading="lazy" class="song-img" width="700" height="394">
  <h2>${esc(title)} — 楽曲解説</h2>
  <p>${esc(rich.p1)}</p>
  <p>${esc(rich.p2)}</p>
  <h3>おすすめ使用シーン</h3>
  <p>${esc(rich.p3)}</p>
  <h3>楽曲情報</h3>
  <table class="info-table">
    <tr><th>ジャンル</th><td>${esc(gJa)}</td></tr>
    ${bpmStr ? `<tr><th>BPM</th><td>${esc(bpmStr)}</td></tr>` : ''}
    ${dur ? `<tr><th>再生時間</th><td>${esc(dur)}</td></tr>` : ''}
    <tr><th>ライセンス</th><td>商用利用OK・登録不要・クレジット不要</td></tr>
    <tr><th>配布元</th><td>日本一フリーBGM</td></tr>
  </table>
  <p>${esc(rich.p4)}</p>
</section>

<p style="margin-top:1.5rem;font-size:12px;color:#b09c84">
  <a href="${esc(BASE_URL)}" style="color:#c85a1e">← 日本一フリーBGM トップへ</a> |
  <a href="${esc(BASE_URL)}/#genre/${esc(song.genre||'')}" style="color:#c85a1e">${esc(gJa)}一覧へ</a>
</p>
<script>
function dlBgm(btn, url, slug) {
  var orig = btn.textContent;
  btn.textContent = '⏳ 準備中…';
  btn.disabled = true;
  fetch(url)
    .then(function(r){ return r.blob(); })
    .then(function(blob){
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = slug + '.mp3';
      document.body.appendChild(a);
      a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      btn.textContent = '✅ ダウンロード完了';
      setTimeout(function(){ btn.textContent = orig; btn.disabled = false; }, 3000);
    })
    .catch(function(){
      btn.textContent = orig;
      btn.disabled = false;
      window.open(url, '_blank');
    });
}
</script>
</body>
</html>`;
}

// ── メイン ────────────────────────────────────────────────
const songs = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
let target;
if (SLUG_FILTER) {
  target = songs.filter(s => (s.slug || s.id) === SLUG_FILTER);
  if (target.length === 0) { console.error(`スラグ "${SLUG_FILTER}" が見つかりません`); process.exit(1); }
} else {
  target = songs.slice(0, LIMIT === Infinity ? songs.length : LIMIT);
}

if (CLEAN && fs.existsSync(OUT_DIR)) {
  fs.rmSync(OUT_DIR, { recursive: true });
  console.log('🗑  songs/ ディレクトリをクリアしました');
}
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

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
if (target.length <= 3) {
  for (const s of target) {
    console.log(`   プレビュー: ${BASE_URL}/songs/${s.slug || s.id}`);
  }
}
