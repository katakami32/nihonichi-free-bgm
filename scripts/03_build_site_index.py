#!/usr/bin/env python3
"""
Build website-ready artifacts:
  - site/data/index.json           : slim, site-facing list (id, title, genre, slug,
                                     description, duration, bpm, tags, audio, image)
  - site/data/by-genre/<g>.json    : per-genre lists
  - site/data/genres.json          : {slug, label_ja, label_en, count, cover}
  - README_DATA.md                 : how the data directory is laid out

Run AFTER 02_download.py so paths reflect files that actually downloaded.
"""
import json, os, collections

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SONGS = os.path.join(ROOT, "data", "songs.json")
OUT_DIR = os.path.join(ROOT, "site", "data")
OUT_BY_GENRE = os.path.join(OUT_DIR, "by-genre")

GENRE_LABELS = {
    # slug          (日本語,                英語)
    "lo-fi":           ("Lo-Fi",               "Lo-Fi / Chill"),
    "ambient":         ("アンビエント",         "Ambient"),
    "jazz":            ("ジャズ",               "Jazz & Bossa Nova"),
    "cinematic":       ("シネマティック",       "Cinematic / Orchestral"),
    "electronic":      ("エレクトロニック",     "Electronic / Synthwave"),
    "j-pop":           ("J-POP / シティポップ", "J-Pop / City Pop"),
    "pop":             ("ポップス",             "Pop"),
    "hip-hop-rnb":     ("ヒップホップ・R&B",    "Hip-Hop / R&B"),
    "rock":            ("ロック",               "Rock"),
    "folk-acoustic":   ("フォーク・アコースティック", "Folk / Acoustic"),
    "japanese-anime":  ("和風・アニメ",         "Japanese / Anime"),
    "corporate-bgm":   ("企業VP・ドキュメンタリー", "Corporate / Documentary"),
    "childrens":       ("キッズ・童謡",         "Children's"),
    "other":           ("その他",               "Other"),
}

def slim(r):
    return {
        "id":          r["id"],
        "slug":        r["slug"],
        "title":       r["title"],
        "genre":       r["genre"],
        "description": r.get("description") or "",
        "tags":        r.get("display_tags") or "",
        "duration":    r.get("duration"),
        "bpm":         r.get("bpm"),
        "model":       r.get("model"),
        "created_at":  r.get("created_at"),
        "audio":       r["audio_path"],
        "image":       r["image_path"],
    }

def main():
    with open(SONGS) as f:
        rows = json.load(f)

    # Only include entries whose audio file actually exists on disk
    existing = []
    for r in rows:
        ap = os.path.join(ROOT, r["audio_path"])
        if os.path.exists(ap) and os.path.getsize(ap) > 1024:
            existing.append(r)
    print(f"songs with downloaded audio: {len(existing)} / {len(rows)}")

    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(OUT_BY_GENRE, exist_ok=True)

    index = [slim(r) for r in existing]
    with open(os.path.join(OUT_DIR, "index.json"), "w") as f:
        json.dump(index, f, ensure_ascii=False)

    # Per-genre files
    by = collections.defaultdict(list)
    for r in index:
        by[r["genre"]].append(r)
    for g, items in by.items():
        with open(os.path.join(OUT_BY_GENRE, f"{g}.json"), "w") as f:
            json.dump(items, f, ensure_ascii=False)

    # Genre index with labels
    genre_list = []
    for g, items in sorted(by.items(), key=lambda kv: -len(kv[1])):
        jp, en = GENRE_LABELS.get(g, (g, g))
        genre_list.append({
            "slug":    g,
            "label_ja":jp,
            "label_en":en,
            "count":   len(items),
            "cover":   items[0]["image"] if items else None,
        })
    with open(os.path.join(OUT_DIR, "genres.json"), "w") as f:
        json.dump(genre_list, f, ensure_ascii=False, indent=2)

    # README
    readme = f"""# Free BGM ライブラリ (Suno AI 生成)

- 総数: **{len(index)} 曲** / **{len(by)} ジャンル**
- 生成元: Suno AI (handle: taka_h2ommm)
- 配布方針: 自作コンテンツのためフリー配布予定

## ディレクトリ構成

```
audio/<genre>/<slug>_<shortid>.mp3    # 音声ファイル (~2MB/曲)
images/<genre>/<slug>_<shortid>.jpeg  # カバー画像
data/songs.json                       # 全曲の完全メタデータ
data/songs.csv                        # 同上 (スプレッドシート用)
data/genres.json                      # ジャンル別曲数
site/data/index.json                  # フロントエンド用スリム版
site/data/by-genre/<slug>.json        # ジャンル別スリム版
site/data/genres.json                 # ジャンル一覧 (ラベル付き)
```

## ジャンル一覧

| ジャンル | 曲数 |
|---|---:|
""" + "\n".join(f"| {g['label_ja']} (`{g['slug']}`) | {g['count']} |" for g in genre_list) + """

## JSON レコード構造 (`site/data/index.json`)

```json
{
  "id":          "uuid",
  "slug":        "midnight-pour-over_9aaa952c",
  "title":       "Midnight Pour Over",
  "genre":       "jazz",
  "description": "Neo soul BGM, jazzy chords, organic drums...",
  "tags":        "neo soul, jazz, lounge",
  "duration":    126,
  "bpm":         85.44,
  "model":       "chirp-v5.5",
  "created_at":  "2026-04-24T12:23:29.167Z",
  "audio":       "audio/jazz/midnight-pour-over_9aaa952c.mp3",
  "image":       "images/jazz/midnight-pour-over_9aaa952c.jpeg"
}
```

## 再実行方法

```bash
python3 scripts/01_prepare.py           # songs.json を再生成
python3 scripts/02_download.py          # 欠落ファイルだけ追加DL (resume-safe)
python3 scripts/03_build_site_index.py  # site/data/* を再生成
```
"""
    with open(os.path.join(ROOT, "README_DATA.md"), "w") as f:
        f.write(readme)

    print(f"wrote {OUT_DIR}/index.json ({len(index)} records)")
    print(f"wrote {len(by)} per-genre files under {OUT_BY_GENRE}")

if __name__ == "__main__":
    main()
