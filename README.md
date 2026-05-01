# 日本一フリーMusicサイト

2,070曲以上を無料で使えるフリーBGMサイト。

🌐 **本番URL**: https://nihonichi-free-auto.pages.dev

---

## アーキテクチャ

```
GitHub リポジトリ
  ├── index.html          ← メインアプリ
  ├── data/               ← 曲メタデータ（JSON）
  │   ├── index.json      ← 全曲リスト（2,070曲）
  │   ├── genres.json     ← ジャンル一覧
  │   └── by-genre/*.json ← ジャンル別曲リスト
  └── .gitignore          ← audio/ images/ は除外
         ↓ git push
Cloudflare Pages          ← index.html + data/ を配信（CORS不要）
         ↓ fetch /data/
ブラウザ
         ↓ <audio> html5:true / <img>
Cloudflare R2 (bgm-data)  ← 音源・画像を配信（CORS設定不要）
  ├── audio/ジャンル/*.mp3   7GB
  └── images/ジャンル/*.jpeg 226MB
```

### CORS 回避の仕組み
| ファイル種類 | 配信元 | 方法 | CORS |
|------------|-------|------|------|
| JSON データ | Cloudflare Pages | `fetch()` | 同一オリジン → 不要 |
| 音楽 MP3 | Cloudflare R2 | Howler.js `html5:true` | `<audio>`タグ → 不要 |
| 画像 JPEG | Cloudflare R2 | `<img>` タグ | タグ読み込み → 不要 |

---

## 開発環境のセットアップ

```bash
# リポジトリをクローン
git clone https://github.com/katakami32/nihonichi-free-bgm.git
cd nihonichi-free-bgm

# ローカルサーバー起動（Python）
python3 -m http.server 8000

# ブラウザで開く
open http://localhost:8000
```

> **注意**: ローカル動作には `audio/` と `images/` フォルダが必要です。
> これらは R2 にのみ保存されており、Git には含まれていません。

---

## デプロイ方法

### 通常のデプロイ（コード・JSON更新時）

```bash
git add .
git commit -m "変更内容の説明"
git push origin main
# → Cloudflare Pages が自動デプロイ（※GitHub連携が有効な場合）
```

### 手動デプロイ（GitHub連携が切れている場合）

1. Cloudflare ダッシュボール → Pages → nihonichi-free-auto
2. 「デプロイ」→ 最新コミットを選択 → 実行

### wrangler CLI でのデプロイ（Pages:Edit 権限のトークンが必要）

```bash
export CLOUDFLARE_API_TOKEN="your_token_here"
npx wrangler pages deploy . --project-name nihonichi-free-auto
```

---

## 必要なトークン権限

| 操作 | 必要な権限 |
|------|---------|
| R2 ファイルのアップロード | `Account → R2 → Edit` |
| wrangler pages deploy | `Account → Cloudflare Pages → Edit` + `User → Memberships → Read` |
| R2 CORS 設定変更 | `Account → R2 → Edit` + `User → Memberships → Read` |

