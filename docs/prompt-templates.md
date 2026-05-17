# 日本一フリーBGMサイト 対応プロンプト集

作成日: 2026-05-17
用途: バグ対応・定期メンテナンス時にClaude Codeへ貼り付けるプロンプトテンプレート

---

## P-01 セッション開始時の状況確認

```
nihonichi-bgm.com のBGMサイトプロジェクトを再開します。

以下を順番に確認してください：

1. git log --oneline -10 で最新コミットを確認
2. python3 -c "import json; d=json.load(open('data/songs.json')); print(len(d),'曲')" で曲数確認
3. ジャンル整合性チェック（genres.json / by-genre/ / index.json の件数一致確認）
4. sw.js のキャッシュバージョン番号を確認
5. CLAUDE.md の残タスクリストを確認

問題があれば報告し、なければ残タスクリストの最優先項目を開始してください。
```

---

## P-02 音声ぷつぷつ音バグ対応

※ このバグは5回以上再発している最頻出バグです。再生系コードを触ったら必ず確認。

```
BGMサイトで音声のぷつぷつ音が発生しています。

過去に同じバグが5回以上繰り返された経緯があります。原因パターン：
- Howler.js html5:true + R2 CDNストリーミングのバッファ切れ
- play() → pause() → play() の高速切替による Audioコンテキスト競合
- setPositionState / requestAnimationFrame の過剰呼び出し

index.html の音声再生コード（play関数・pause関数・howl.on('end')・howl.on('play')）を確認し、
以下の観点で修正してください：

1. play() 呼び出し前に前の Howl インスタンスを完全に unload しているか
2. setPositionState の呼び出し頻度は1秒1回以下に絞られているか
3. ループ再起動時（howl.on('end')）で seek(0) + play() を使っているか
4. pause/resume 時にフェードを使っているか（急停止がぷつぷつの原因になる）

修正後は「曲切替」「一時停止→再開」「シーク」「ループ再生」の4パターンで
動作確認してぷつぷつが出ないことを確認してからPRを作成してください。
```

---

## P-03 ジャンルデータ整合性チェック・修正

※ ジャンル関連の変更後は必ず実行。4ファイルの同期が崩れやすい。

```
BGMサイトのジャンルデータを確認・修正してください。

以下の4ファイルは常に同期が必要です：
- data/songs.json（gitignore・ローカルのみ）
- data/genres.json（git管理・本番反映）
- data/by-genre/{slug}.json（git管理・本番反映）
- data/index.json（git管理・本番反映）

以下のチェックスクリプトを実行してください：

python3 -c "
import json, os
from collections import Counter
songs = json.load(open('data/songs.json'))
genres = json.load(open('data/genres.json'))
idx = json.load(open('data/index.json'))
songs_count = Counter(s.get('genre','') for s in songs)
idx_count = Counter(s.get('genre','') for s in idx)
print('slug | genres.json | songs.json | by-genre/ | index.json')
for g in genres:
    slug = g['slug']
    bf = 'data/by-genre/' + slug + '.json'
    bc = len(json.load(open(bf))) if os.path.exists(bf) else -1
    ok = '✅' if songs_count[slug]==bc==idx_count[slug]==g['count'] else '❌'
    print(f'{ok} {slug}: {g[\"count\"]} | {songs_count[slug]} | {bc} | {idx_count[slug]}')
"

不整合があれば songs.json を正として、他3ファイルを修正してください。
修正後に再チェックして全項目が ✅ になることを確認してからコミットしてください。
```

---

## P-04 新ジャンル追加

```
BGMサイトに新しいジャンルを追加してください。

ジャンル情報：
- スラッグ: {slug}（例: k-pop）
- 日本語ラベル: {label_ja}（例: K-POP）
- 英語ラベル: {label_en}（例: K-Pop）
- 対象曲の条件: {条件}（例: タグに 'k-pop' を含む曲）
- アイコン絵文字: {emoji}（例: 💗）
- バッジ色: {CSS rgba}（例: rgba(230,80,160,.85)）

実施手順（抜け漏れなく全部やること）：

データ更新：
1. songs.json の対象曲の genre フィールドを更新
2. genres.json にエントリを追加（slug, label_ja, label_en, count, cover）
3. data/by-genre/{slug}.json を作成
4. data/index.json の対象曲のジャンルを更新
5. 移動元ジャンルの genres.json count を減算・by-genre も更新

index.html 更新：
6. GENRE_CLASS に '{slug}':'g-{slug}' を追加
7. .gtag.g-{slug} の CSS を追加（色は既存ジャンルと差別化）
8. ジャンルアイコンマップ ic に '{slug}':'{emoji}' を追加
9. BGMチャンネルの rmcard ボタンを J-Pop の隣に追加
10. GENRE_SLUG_JA マップに '{slug}':'{label_ja}' を追加
11. BGMチャンネルのキーワード検出テーブルに追加
12. NAVIちゃんのジャンル一覧テキスト（約8521行）に追加

最後に P-03 の整合性チェックを実行して全ジャンルが ✅ になることを確認してください。
```

---

## P-05 ServiceWorkerキャッシュ更新

※ index.html を変更したら必ずセットで実行。4回同じバグが発生した。

```
BGMサイトのデプロイ後、古いキャッシュが配信されるバグの予防対応です。

sw.js のキャッシュバージョンを確認・更新してください：

1. sw.js の現在のバージョン番号を確認（CACHE_NAME = 'bgm-cache-v??'）
2. バージョンを +1 にインクリメント
3. index.html の変更と合わせてコミット

ルール：index.html を変更するたびに sw.js も必ず更新する。
更新後は本番URLで Shift+Reload して最新版が表示されることを確認してください。
```

---

## P-06 曲の一括削除（安全版）

※ クリーンアップ時に K-POP 22曲中20曲を誤削除した経緯あり。必ずこの手順を守ること。

```
BGMサイトの孤立曲（音源・画像が存在しない曲）を安全に削除してください。

削除前に必ず実行するクロスチェック：

python3 -c "
import json, os
songs = json.load(open('data/songs.json'))
genres = json.load(open('data/genres.json'))
genre_slugs = {g['slug'] for g in genres}

# by-genre に存在する全曲IDを収集
registered_ids = set()
for slug in genre_slugs:
    bf = 'data/by-genre/' + slug + '.json'
    if os.path.exists(bf):
        for s in json.load(open(bf)):
            registered_ids.add(s['id'])

# ローカル音源がない曲を候補に
audio_ids = set()
for root, dirs, files in os.walk('audio'):
    for f in files:
        if f.endswith('.mp3'):
            audio_ids.add(os.path.splitext(f)[0])

orphan = [s for s in songs
          if s.get('slug','').split('_')[-1] not in audio_ids
          and s['id'] not in registered_ids]
print('削除候補（by-genre未登録・音源なし）:', len(orphan), '曲')
for s in orphan[:10]:
    print(' -', s.get('title'), s['id'][:8])
"

削除候補を提示して確認を取ってから削除を実行してください。
削除後は P-03 の整合性チェックを必ず実行してください。
```

---

## P-07 モバイル・iOS動作確認チェックリスト

※ PC Chrome で開発後、必ずこのリストを確認してからコミット。

```
BGMサイトのコードを変更しました。モバイル・iOS での動作を確認してください。

確認項目（全項目パスしてからPRを作成すること）：

[ ] 再生ボタン：モバイルタップで音が出るか（UserGesture要件）
[ ] 共有ボタン：640px以下でも表示されているか（display:none になっていないか）
[ ] ダウンロードボタン：Blob経由でMP3がダウンロードできるか（download属性はR2クロスオリジンで無効）
[ ] iOS画面ロック：ロック中も音楽が止まらないか（MediaSession API）
[ ] Safe Area：iPhone のノッチ・ホームバーで UI が隠れていないか
[ ] 自動ズーム：テキスト入力時に iOS が自動ズームしないか（font-size 16px以上）
[ ] 曲カードタップ：モバイルでタップして再生が始まるか

CSS の media query (max-width: 640px) 付近を確認し、
問題があれば修正してから再確認してください。
```

---

## P-08 新曲追加（Suno生成後）

```
Suno で新しくBGMを生成しました。BGMサイトに追加してください。

手順：
1. python3 scripts/06_add_new_songs.py を実行
2. P-03 の整合性チェックを実行（全ジャンル ✅ になるまで修正）
3. sitemap.xml を更新：node scripts/generate-sitemap.js
4. index.html の SEOブロック（#seo-song-catalog）を再生成
5. sw.js のキャッシュバージョンを +1（P-05 参照）
6. CLAUDE.md の曲数・サイトマップ行数を最新に更新

コミットメッセージ例：feat: 新曲XX本追加（合計XXXX曲）

コミット後、本番サイトで新曲が表示されることを確認してください。
```

---

## P-09 定期メンテナンス

```
BGMサイトの定期メンテナンスを行います。以下を順番に確認してください。

【データ整合性】
- P-03 のジャンル整合性チェックを実行
- songs.json と index.json の総曲数が一致するか

【キャッシュ】
- sw.js のキャッシュバージョンが最新の index.html 変更に追いついているか

【SEO】
- sitemap.xml の lastmod が最新の更新日か
- index.html・JSON-LD・CLAUDE.md の曲数が一致しているか

【再生】
- 本番で「曲切替」「一時停止→再開」「ループ」を実際に試してぷつぷつが出ないか

【モバイル】
- スマホ実機またはDevToolsのモバイルビューで表示崩れがないか

問題があれば修正後に git push origin main でデプロイしてください。
```

---

## 参照

- バグ報告書: docs/bug-report-2026-05.md
- プロジェクト概要: CLAUDE.md
- よく使うコマンド: CLAUDE.md の「よく使うコマンド」セクション
