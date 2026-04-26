# 運用マニュアル：曲追加 → デプロイ 最短手順

## 構成の前提

- **音源・画像** → Cloudflare R2 バケット `bgm-data`
- **メタデータ（JSON）** → GitHub + Cloudflare Pages
- **コード（index.html）** → GitHub + Cloudflare Pages

---

## ① 新曲を追加する手順

### Step 1: ファイルを R2 にアップロード

```bash
cd /Users/hiro/Desktop/音楽フリーBGMサイト

# 音楽ファイル（例: jazz ジャンル）
npx wrangler r2 object put bgm-data/audio/jazz/新曲名.mp3 \
  --file ./audio/jazz/新曲名.mp3

# カバー画像
npx wrangler r2 object put bgm-data/images/jazz/新曲名.jpeg \
  --file ./images/jazz/新曲名.jpeg
```

> 複数ファイルを一括アップロードする場合:
> ```bash
> # ジャンルフォルダごとアップロード
> for f in audio/jazz/*.mp3; do
>   npx wrangler r2 object put "bgm-data/$f" --file "$f"
> done
> ```

### Step 2: data/index.json を更新

```json
// data/index.json の songs 配列に追加
{
  "id": "一意のID",
  "title": "曲名",
  "title_ja": "曲名（日本語）",
  "genre": "jazz",
  "audio": "audio/jazz/新曲名.mp3",
  "image": "images/jazz/新曲名.jpeg",
  "duration": 180,
  "tags": ["jazz", "relaxing"]
}
```

### Step 3: data/genres.json のカウントを更新（任意）

```bash
# Python でカウントを自動更新する場合
python3 -c "
import json
with open('data/index.json') as f:
    songs = json.load(f)

# ジャンル別にカウント
counts = {}
for s in (songs.get('songs', songs) if isinstance(songs, dict) else songs):
    g = s.get('genre', 'other')
    counts[g] = counts.get(g, 0) + 1

# genres.json を更新
with open('data/genres.json') as f:
    genres = json.load(f)
for g in genres:
    g['count'] = counts.get(g['slug'], 0)
with open('data/genres.json', 'w') as f:
    json.dump(genres, f, ensure_ascii=False, indent=2)
print('genres.json 更新完了')
"
```

### Step 4: GitHub にプッシュ → 自動デプロイ

```bash
git add data/index.json data/genres.json
git commit -m "Add new songs: [曲名など]"
git push origin main
# → Cloudflare Pages が自動デプロイ（1〜2分）
```

---

## ② GitHub ↔ Cloudflare Pages の自動連携を修復する手順

現在、git push 後に自動デプロイが動いていない場合の修復手順：

1. **Cloudflare ダッシュボール** にログイン
   → https://dash.cloudflare.com

2. **Pages** → **nihonichi-freemusicbgm** を選択

3. **Settings（設定）** タブ → **Build & deployments** セクション

4. **Git integration（Git 連携）** の項目を確認
   - 「Connected to GitHub」と表示されていれば正常
   - 「Not connected」または警告が出ていれば → **「Manage」** をクリック

5. **GitHub アカウントの再認証**
   - 「Connect to GitHub」→ GitHub でログイン → リポジトリ `katakami32/nihonichi-free-bgm` を選択
   - Branch: `main`
   - Build command: （空白でOK）
   - Build output directory: `/`（ルート）

6. 保存後、次の `git push` から自動デプロイが再開

---

## ③ wrangler pages deploy で直接デプロイ（自動化用）

**必要なトークン権限:**
- `Account → Cloudflare Pages → Edit`
- `User → Memberships → Read`
- `User → User Details → Read`

**トークン作成手順:**
1. https://dash.cloudflare.com → プロフィール → **API トークン**
2. **「カスタムトークンを作成」**
3. 権限を追加（上記3項目）
4. アカウント: `Maruhiro8220@icloud.com's Account` を指定
5. 作成 → トークンをコピー

**デプロイコマンド:**
```bash
export CLOUDFLARE_API_TOKEN="YOUR_TOKEN_HERE"
export CLOUDFLARE_ACCOUNT_ID="dec079cbb6f80e5bf626941e3f83844b"

npx wrangler pages deploy . \
  --project-name nihonichi-freemusicbgm \
  --branch main
```

---

## ④ 本番環境の動作確認チェックリスト

```bash
BASE="https://nihonichi-freemusicbgm.pages.dev"
R2="https://pub-c8052da2182b4317bc252b78e473584c.r2.dev"

# データファイル確認
curl -o /dev/null -s -w "data/index.json:  %{http_code}\n" "$BASE/data/index.json"
curl -o /dev/null -s -w "data/genres.json: %{http_code}\n" "$BASE/data/genres.json"

# 音楽・画像確認（サンプル）
curl -o /dev/null -s -w "audio:  %{http_code}\n" "$R2/audio/jazz/midnight-pour-over_9aaa952c.mp3"
curl -o /dev/null -s -w "image:  %{http_code}\n" "$R2/images/ambient/merry-eve-snowfall_0d9e8f9f.jpeg"
```

すべて `200` であれば正常です。

---

## ⑤ R2 URL

```
パブリック URL: https://pub-c8052da2182b4317bc252b78e473584c.r2.dev
バケット名:     bgm-data
アカウント ID:  dec079cbb6f80e5bf626941e3f83844b
```

