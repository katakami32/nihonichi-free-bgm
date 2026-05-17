# 日本一フリーBGMサイト — CLAUDE.md

> このファイルはClaude Codeが自動参照するプロジェクト情報ファイルです。
> 日本語で回答してください。

---

## プロジェクト基本情報

- **サイト名**: 日本一フリーBGMサイト
- **本番URL**: https://nihonichi-bgm.com
- **GitHubリポジトリ**: `git@github.com:katakami32/nihonichi-free-bgm.git`
- **デプロイ先**: Cloudflare Pages（`main`ブランチへのPushで自動デプロイ）
- **音源・画像**: Cloudflare R2（バケット名: `bgm-data`）

## ファイル構成

```
/Users/hiro/Desktop/音楽フリーBGMサイト/
├── index.html              ← メインアプリ（SPA）
├── data/
│   ├── songs.json          ← 全曲メタデータ（2,090曲）
│   ├── index.json          ← 曲リスト（軽量版）
│   ├── genres.json         ← ジャンル一覧
│   └── by-genre/*.json     ← ジャンル別曲リスト
├── scripts/                ← データ整備・SEO生成スクリプト群
│   ├── 01_prepare.py       ← Suno APIからメタデータ取得
│   ├── 02_download.py      ← 音源ダウンロード
│   ├── 03_build_site_index.py ← songs.json生成
│   ├── 06_add_new_songs.py ← 新曲追加ワークフロー
│   └── generate-sitemap.js ← サイトマップ生成
├── workers/                ← Cloudflare Workers（API等）
├── .claude/
│   ├── settings.local.json ← パーミッション設定（Stopフック含む）
│   ├── on-stop.sh          ← Stopフック（エラー時自動再起動）
│   └── active_sessions.md  ← セッション管理レジストリ
└── CLAUDE.md               ← このファイル
```

## 技術スタック

| 項目 | 技術 |
|------|------|
| フロントエンド | バニラHTML/CSS/JS（フレームワークなし） |
| 音楽再生 | Howler.js（`html5: true`でCORS回避） |
| データ配信 | Cloudflare Pages（JSON） + Cloudflare R2（MP3/JPEG） |
| CI/CD | GitHub → Cloudflare Pages 自動デプロイ |
| 音楽生成 | Suno AI（ユーザー: taka_h2ommm） |

## 現在の状態（2026-05-14時点）

- ✅ **曲数**: 2,090曲（songs.json管理）
- ✅ **曲詳細ページ**: 実装済み（全2,129曲 `/songs/` ページあり・SEO対策済み）
- ✅ **ダウンロードボタン**: Blob方式に修正済み（全2,129ページ反映済み）
- ✅ **サイトマップ**: 全2,156URL収録・lastmod 2026-05-14 に更新済み・Googleサーチコンソールに送信待ち
- ✅ **SEOカタログ**: `index.html` 内の `#seo-song-catalog` に全曲への静的リンクあり（Googlebot対応）
- ✅ **Stopフック**: エラー停止時の自動再起動設定済み（`.claude/on-stop.sh`）
- ✅ **本番稼働中**: R2音源・画像ともに配信中

## 🔴 中断中の作業（最優先で再開）

**「曲名タップ→詳細ページ遷移をユーザー向けに改善したい」**

- 現状: 曲名タップで詳細ページへ遷移する機能は実装済み（PR #38）
- ユーザーの要望: ホームページから各曲詳細ページへの導線をより分かりやすく・使いやすくしたい
- 前セッションがコンテキスト上限で停止し、実装案を提案する直前で中断

→ **再開時はまず `index.html` の曲カード部分と `/songs/` ページ構成を確認し、UX改善案を提案すること**

## 残タスクリスト

- [ ] **【中断】曲詳細ページへの導線をユーザー向けに改善**（中断した作業を最初に再開）
- [ ] Googleサーチコンソールで `https://nihonichi-bgm.com/sitemap.xml` を再送信（手動・1回だけ）
- [ ] 新曲の追加（Sunoで新規クリップ生成後、`scripts/06_add_new_songs.py`で追加）
- [ ] AdSense審査通過の確認・改善
- [ ] 曲数を増やす（目標: 3,000曲以上）
- [ ] ジャンルページの充実（per-genre JSONの整備）
- [ ] サイトパフォーマンス計測（Core Web Vitals確認）

## よく使うコマンド

```bash
# ローカルプレビュー
python3 -m http.server 8000

# 新曲追加ワークフロー
python3 scripts/06_add_new_songs.py

# サイトマップ更新
node scripts/generate-sitemap.js

# デプロイ（mainにPushで自動）
git add . && git commit -m "feat: ..." && git push origin main
```

## 作業ルール

1. **変更はPRを通してmainにマージ**（直接pushは緊急時のみ）
2. **音源・画像はGit管理外**（R2のみ）— `.gitignore`で除外済み
3. **songs.jsonが正とする**（index.json等はsongs.jsonから生成）
4. **コミットメッセージ**: `feat:` / `fix:` / `chore:` / `perf:` の慣習に従う

## 🏆 新曲追加 最強ルール（バグゼロ保証手順）

> **必ずこの順番通りに実行する。スキップ厳禁。**

### STEP 1: Sunoで曲を生成・ダウンロード

- Suno AI（ユーザー: taka_h2ommm）で曲を生成
- 音源（MP3）と画像（JPEG）をローカルにダウンロード

### STEP 2: 新曲追加スクリプト実行

```bash
python3 scripts/06_add_new_songs.py
```

- ジャンル判定は自動（`GENRE_RULES` が優先順位順にマッチ）
- `index.json`・`by-genre/*.json`・`genres.json` を自動更新
- **SEO詳細ページ**（`/songs/<slug>.html`）を新曲ごとに自動生成
- **SEOカタログ**（`index.html` の隠しリスト）を自動更新
- **タイトル重複チェック**を自動実行（重複があれば警告）
- **BGMチャンネルは自動連携**（`index.json` から全曲を読むため追加作業不要）

> 🔒 **データ消失防止ガード（スクリプト内蔵）**
> - 曲数が減少していたら書き込みを即abort（絶対に上書きしない）
> - 書き込み前に `index.json.bak` を自動バックアップ
> - tmpファイル経由のアトミック書き込み（クラッシュ時も安全）
> - 書き込み後に件数を検証してから本ファイルに置換

#### ジャンル判定ルール（優先順位順・完全版）

| 優先 | ジャンルslug | 代表キーワード |
|-----|------------|-------------|
| 1 | `k-pop` | k-pop, kpop, korean, dance pop |
| 2 | `horror` | horror, dark ambient, scary, creepy, thriller |
| 3 | `wafu` | 和風, wagakki, shakuhachi, koto, taiko, matsuri |
| 4 | `lo-fi` | lo-fi, lofi, chillhop |
| 5 | `ambient` | ambient, drone, meditation, rain |
| 6 | `jazz` | jazz, bossa nova, swing, blues, fusion |
| 7 | `cinematic` | cinematic, orchestral, epic, dramatic |
| 8 | `electronic` | edm, synthwave, house, techno, dubstep, dnb |
| 9 | `childrens` | children, kids, nursery, lullaby, cartoon |
| 10 | `j-pop` | j-pop, city pop, ballad, shibuya-kei |
| 11 | `folk-acoustic` | folk, acoustic, country, fingerstyle |
| 12 | `hip-hop-rnb` | hip-hop, trap, r&b, soul, funk |
| 13 | `rock` | rock, punk, metal, grunge, alternative |
| 14 | `japanese-anime` | anime, vocaloid, enka, anison |
| 15 | `corporate-bgm` | corporate, documentary, business |
| 16 | `pop` | pop |
| 17 | `other` | （上記いずれにもマッチしない場合） |

> ⚠️ **新ジャンル追加時は必ず** `GENRE_RULES`・`GENRE_LABELS`・`GENRE_EN`（06_add_new_songs.py内）と `genres.json` の4箇所を同時に更新すること。

### ジャンル崩壊を防ぐルール

#### 🚨 絶対にやってはいけないこと
- `GENRE_RULES` のキーワードを **部分文字列で被るように** 追加しない
  - 例: `"k-pop"` を追加すると `"folk-pop"` にもマッチしてしまう（過去に発生した実バグ）
  - → `pick_genre()` は単語境界マッチ（`(?<![a-z0-9])keyword(?![a-z0-9])`）で実装済み
- ジャンルを追加・変更したあとに **既存曲の再スキャンをしない**
  - → 新キーワードに該当する既存曲が古いジャンルのまま残る

#### ✅ ジャンルを変更・追加したあとに必ずやること

```bash
# 既存曲のジャンルを再スキャンして修正
python3 -c "
import json, re, collections, shutil
from pathlib import Path

ROOT = Path('.')
DATA_FILE = ROOT / 'data' / 'index.json'
GENRES_FILE = ROOT / 'data' / 'genres.json'

# 06_add_new_songs.py の GENRE_RULES を参照するためインポート
import sys; sys.path.insert(0, str(ROOT / 'scripts'))
from 06_add_new_songs import GENRE_RULES, pick_genre  # noqa

songs = json.loads(DATA_FILE.read_text())
shutil.copy2(DATA_FILE, DATA_FILE.with_suffix('.json.bak'))

changed = 0
for s in songs:
    new_genre = pick_genre(s.get('tags', ''))
    if new_genre != s.get('genre') and new_genre != 'other':
        s['genre'] = new_genre
        changed += 1

print(f'再分類: {changed}曲')
DATA_FILE.write_text(json.dumps(songs, ensure_ascii=False))
"
```

> ただし上記は全曲を再判定するため、意図的に手動で設定したジャンルも上書きされる場合がある。
> 変更後は **P-10チェックリスト** を必ず実行してズレがないか確認すること。

#### ✅ ジャンル整合性クイックチェック（いつでも実行可）

```bash
python3 scripts/10_post_upload_check.py
```

- 全ジャンルの曲数が `index.json` ↔ `by-genre/*.json` ↔ `genres.json` で一致しているか確認
- ❌ が出たら `index.json` を正として他ファイルを修正する

### STEP 3: データ整合性チェック（必須）

```bash
python3 scripts/10_post_upload_check.py
```

❌が1つでも出たら先に進まない。`songs.json` を正として他ファイルを修正する。

### STEP 4: R2に音源・画像をアップロード

```bash
export CLOUDFLARE_API_TOKEN=...
# R2アップロードはスクリプト経由のみ（手動操作・直接削除禁止）
```

### STEP 5: サイトマップ更新

```bash
node scripts/generate-sitemap.js
```

### STEP 6: SW キャッシュバージョンを +1

`index.html` 内の `CACHE_VERSION` を +1（P-05参照）。**忘れると古いキャッシュが残り再生バグが発生する。**

### STEP 7: CLAUDE.md の曲数を更新

「現在の状態」セクションの曲数を最新に書き換える。

### STEP 8: コミット・プッシュ

```bash
git add data/ index.html
git commit -m "feat: 新曲XX本追加（合計XXXX曲）"
git push origin main
```

### STEP 9: 本番確認

- https://nihonichi-bgm.com で新曲が表示されることを確認
- 新曲の再生・ダウンロードが動作することを確認

---

## バグ対応リソース

- **バグ報告書**: `docs/bug-report-2026-05.md` — 過去の全バグ分類・再発パターン分析
- **対応プロンプト集**: `docs/prompt-templates.md` — 定型プロンプト P-01〜P-10
  - P-01: セッション開始時の状況確認
  - P-02: 音声ぷつぷつ音バグ（最頻出・5回再発）
  - P-03: ジャンルデータ整合性チェック（ジャンル変更後は必須）
  - P-04: 新ジャンル追加
  - P-05: SWキャッシュ更新（index.html変更時は必ずセット）
  - P-06: 曲の一括削除（安全版・誤削除防止）
  - P-07: モバイル・iOS動作確認チェックリスト
  - P-08: 新曲追加（Suno生成後）
  - P-09: 定期メンテナンス
  - **P-10: 新曲追加後の必須チェックリスト** ← 新曲追加のたびに必ず実行（10種類の連鎖バグ防止）

---

## 【自動起動指示】

エージェントとして起動された場合、まずこのセクションを読んで状況を把握する。

### 起動時にやること

1. `git status` と `git log --oneline -5` で現在の状態を確認
2. `python3 -c "import json; d=json.load(open('data/songs.json')); print(len(d),'曲')"` で曲数確認
3. `.claude/active_sessions.md` で他に動いているセッションがないか確認
4. ユーザーからの指示がある場合はそれに従う
5. 指示がない場合は「残タスクリスト」から優先度の高いものを選んで着手

### 完了時にやること

1. 変更をコミット・プッシュ（PRを作る）
2. このCLAUDE.mdの残タスクリストを更新（完了したものを `- [x]` に変更）
3. `.claude/active_sessions.md` のステータスを `completed` に変更
4. 完了マーク作成: `mkdir -p .claude/completed && touch .claude/completed/$(date +%Y%m%d_%H%M%S).done`

### 重要な制約

- `rm -rf` などの破壊的コマンドは絶対に実行しない
- Cloudflare APIトークンは環境変数 `CLOUDFLARE_API_TOKEN` から取得
- R2への音源アップロードはスクリプト経由のみ
