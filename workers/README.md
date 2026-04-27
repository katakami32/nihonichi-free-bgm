# 日本一フリーMusic — Cloudflare Workers / D1 バックエンド

このディレクトリは、フロントエンド (`../index.html`) を支える検索/再生/DLカウントAPIです。
ローカル開発時は `index.html` がそのまま `site/data/*.json` を読むので **APIを立てなくても動きます**。
デプロイした後に `index.html` の `BGM_CONFIG.apiBase` を Workers のURLに書き換えれば、
2万曲スケールでも軽快に動く構成になります。

---

## ファイル構成

```
workers/
├─ package.json                Hono + Wrangler
├─ wrangler.toml               D1 / KV / vars 設定
├─ tsconfig.json
├─ schema.sql                  D1 スキーマ（FTS5全文検索付き）
├─ src/
│  └─ index.ts                 Hono製 Workers (Public API + Admin API)
└─ scripts/
   └─ build_import_sql.mjs     既存 site/data/*.json → D1 用 INSERT SQL
```

---

## 0. 事前準備（一度だけ）

```bash
# Cloudflare CLI の準備
npm i -g wrangler        # 既に入ってればスキップ
wrangler login           # ブラウザが開いてCloudflareアカウントへログイン

# 依存パッケージ
cd workers
npm install
```

---

## 1. D1データベースを作る

```bash
wrangler d1 create bgm
```

出力される `database_id` を **`wrangler.toml` の `REPLACE_WITH_YOUR_D1_ID` に貼り付け** ます。

スキーマを流し込み:
```bash
npm run schema:remote   # 本番D1へ
# 開発で wrangler dev を使うなら:
# npm run schema:local
```

---

## 2. KV ネームスペースを作る

```bash
wrangler kv namespace create KV
```

出ている `id` を `wrangler.toml` の `REPLACE_WITH_YOUR_KV_ID` に貼り付けます。

---

## 3. 既存データ (2,070曲) を D1 にインポート

```bash
npm run import:remote
```

中身は2ステップ:
1. `node scripts/build_import_sql.mjs` で `.import.sql` (約1.1MB) を生成
2. `wrangler d1 execute bgm --remote --file=.import.sql` で D1 に流し込み

D1のバルクINSERTは1.1MBくらいなら数秒で終わります。`SELECT count(*) FROM songs;` で 2070 が返れば成功:
```bash
wrangler d1 execute bgm --remote --command="SELECT COUNT(*) FROM songs"
```

---

## 4. R2 バケットを作って音声・画像をアップロード

```bash
# バケット作成
wrangler r2 bucket create bgm-assets

# audio と images をまとめてアップロード（プロジェクトルートで実行）
cd ..
wrangler r2 object put bgm-assets/audio  --file ./audio  --pipe < /dev/null  # 不可。下記参照
```

> `wrangler r2 object put` は**1ファイルずつ**しか送れません。2万ファイルなら **rclone** が圧倒的に楽。

### rclone で一括アップロード（推奨）

```bash
# rclone を入れる
brew install rclone

# Cloudflare ダッシュボードで R2 API トークンを発行
#   R2 → "Manage R2 API Tokens" → Create API Token (Object Read & Write)
#   表示される Access Key ID / Secret / S3 endpoint をメモ

# 設定 (~/.config/rclone/rclone.conf に追記、または対話的に rclone config)
cat >> ~/.config/rclone/rclone.conf <<'EOF'
[r2]
type = s3
provider = Cloudflare
access_key_id = YOUR_R2_ACCESS_KEY
secret_access_key = YOUR_R2_SECRET
endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
acl = private
EOF

# 中身を流し込み（プロジェクトルートで実行）
cd /Users/hiro/Desktop/音楽フリーBGMサイト
rclone copy ./audio  r2:bgm-assets/audio  --transfers=8 --progress
rclone copy ./images r2:bgm-assets/images --transfers=8 --progress
```

### R2 を Custom Domain で公開

1. Cloudflare ダッシュボード → R2 → `bgm-assets` → Settings → "Public access" を "Custom Domain" で有効化
2. 例えば `cdn.example.com` にする
3. `wrangler.toml` の `R2_PUBLIC_BASE` を `"https://cdn.example.com"` に変更

> Public access を有効化していない場合は、API が返す `audio_url` / `image_url` が `null` になります。**必ずやってください**。

---

## 5. 管理者トークンをセット

```bash
wrangler secret put ADMIN_TOKEN
# プロンプトに表示されるので、強めのランダム文字列を貼り付け
# 例: openssl rand -hex 32
```

---

## 6. Workers をデプロイ

```bash
npm run deploy
```

成功すると `https://bgm-api.<your-subdomain>.workers.dev` が発行されます。
動作確認:
```bash
curl https://bgm-api.<your-subdomain>.workers.dev/api/genres
curl 'https://bgm-api.<your-subdomain>.workers.dev/api/songs?limit=3'
curl 'https://bgm-api.<your-subdomain>.workers.dev/api/search?q=jazz&limit=3'
```

---

## 7. フロントエンド (index.html) を API に向ける

`index.html` を開いて、`<script>window.BGM_CONFIG = {...}` の中を書き換えます:

```js
window.BGM_CONFIG = {
  apiBase:   'https://bgm-api.<your-subdomain>.workers.dev', // ← Workers URL
  dataBase:  'site/data',
  assetBase: 'https://cdn.example.com'                       // ← R2 Custom Domain
};
```

`apiBase` が空でなければ自動でAPIモードになります。
APIから返る `audio_url` / `image_url` がフルURLなら `assetBase` は空でもOKです。

---

## 8. Cloudflare Pages にフロントを置く

ドラッグ&ドロップで一発:
```bash
cd /Users/hiro/Desktop/音楽フリーBGMサイト
wrangler pages deploy . --project-name=bgm-site
```

これで `https://bgm-site.pages.dev` が動きます。
独自ドメインを当てるなら、Cloudflare ダッシュボード → Pages → Custom domains。

---

## 動作チェックリスト

| 項目 | 確認方法 |
|---|---|
| ジャンル一覧 | `/api/genres` が `[{slug,label_ja,count}, ...]` |
| 一覧 | `/api/songs?genre=jazz&bpm=mid&sort=new&page=1&limit=24` |
| 検索 | `/api/search?q=cafe` |
| 詳細 | `/api/song/midnight-pour-over_9aaa952c` |
| 人気 | `/api/popular` (10分KVキャッシュ) |
| 統計 | `/api/stats` |
| 再生カウント | `curl -X POST https://.../api/play -H 'content-type: application/json' -d '{"id":"..."}' ` |
| 管理API | `curl -X POST https://.../api/admin/songs -H "Authorization: Bearer $TOKEN" ...` |

---

## ローカル開発

### Workers をローカル実行
```bash
npm run schema:local
npm run import:local
npm run dev          # http://localhost:8787
```

### フロントをローカル実行
プロジェクトルートで:
```bash
cd /Users/hiro/Desktop/音楽フリーBGMサイト
python3 -m http.server 8000
# http://localhost:8000/ を開く
```

ローカル Workers と組み合わせるなら `BGM_CONFIG.apiBase = 'http://localhost:8787'` に。

---

## 無料枠と費用感

- **Pages / Workers / D1 / KV** はすべて無料枠で運用可能（`research/09_cloudflare_architecture.md` 参照）
- **R2 ストレージ** は10GBまで無料、超過分は$0.015/GB/月
  - 現在の音声 2,070曲 × 2MB ≈ 4GB → **完全無料**
  - 2万曲に拡大しても 40GB ≈ **月$0.45**
  - **エグレス(下り) は完全無料** が R2 最大の利点

---

## 何かおかしいときは

| 症状 | 原因と対策 |
|---|---|
| `wrangler d1 execute --file=.import.sql` がタイムアウト | バッチが大きすぎる。SQLを `split -l 500` で分割して順次流す |
| 画像/音声が `null` で返ってくる | `wrangler.toml` の `R2_PUBLIC_BASE` 未設定、または R2 のPublic accessが無効 |
| CORS エラー | `wrangler.toml` の `ALLOWED_ORIGIN` を Pages のURLに合わせる |
| FTS5 の検索でエラー | クエリに `'` や `"` が混入。Worker側で `q.replace(/"/g,'""')` 済みだが、空文字は弾く |
| 検索結果が0件 | trigram は3文字以上必要。短いクエリは LIKE フォールバックに自動切替 |
| 管理APIが 401 | `wrangler secret put ADMIN_TOKEN` し直し、`Authorization: Bearer ...` を見直し |

---

## 次の打ち手（任意）

- **管理画面**: 別の Pages プロジェクトとして `admin/` を作り、Cloudflare Access で保護
- **Cron Trigger**: 1日1回 `/api/popular` のキャッシュをプリウォーム
- **Sitemap自動生成**: `/sitemap.xml` を Workers から動的に返してSEO強化
- **JSON-LD `MusicRecording`**: 詳細ページに schema.org 構造化データを埋め込んでGoogle検索↑
- **Turnstile**: `/api/download` を bot から保護
