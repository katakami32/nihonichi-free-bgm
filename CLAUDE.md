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

## バグ対応リソース

- **バグ報告書**: `docs/bug-report-2026-05.md` — 過去の全バグ分類・再発パターン分析
- **対応プロンプト集**: `docs/prompt-templates.md` — 定型プロンプト P-01〜P-09
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
