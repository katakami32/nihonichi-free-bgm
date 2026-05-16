#!/usr/bin/env python3
"""
09_dedupe_rename.py
================================================================
data/index.json の重複タイトルを検出し、2回目以降の出現に対して:
  - title に ローマ数字サフィックス（Ⅱ, Ⅲ, …, Ⅻ, (13)+...）を付与
  - slug を `<base>-<ascii_suffix>_<idhash>` に変更（ASCII safe）
  - ローカル audio/image ファイルをリネーム
  - R2 上の新キーへ wrangler put し、旧キーを削除（冪等）
  - index.json を書き換え保存（バックアップ付）

これにより:
  - 表示タイトル: "Sheri Runsfloor" / "Sheri Runsfloor Ⅱ"
  - ダウンロード時のファイル名（ブラウザ既定）も "sheri-runsfloor-ii_b86e0d84.mp3"
  - 個別SEOページURL も /songs/sheri-runsfloor-ii_b86e0d84.html
で統一感が出る。

既存の scripts/fix-duplicate-titles.js は title のみ変更し、ファイル本体・
R2キー・slug を触らないため別途これが必要。

冪等: 既に " Ⅱ"〜" Ⅻ" / " (n)" のついた曲は再処理しない。

使い方:
  python3 scripts/09_dedupe_rename.py            # 実行
  python3 scripts/09_dedupe_rename.py --dry-run  # 影響範囲だけ確認
================================================================
"""
import json, os, sys, subprocess, shutil
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).parent.parent
DATA_FILE = ROOT / "data" / "index.json"
GENRES_FILE = ROOT / "data" / "genres.json"
R2_BUCKET = "bgm-data"
R2_PUB = "https://pub-c8052da2182b4317bc252b78e473584c.r2.dev"

DRY = "--dry-run" in sys.argv

# 2回目以降に付与するサフィックス
SUFFIX_LIST = [
    (None, None),
    ("Ⅱ",  "ii"),
    ("Ⅲ",  "iii"),
    ("Ⅳ",  "iv"),
    ("Ⅴ",  "v"),
    ("Ⅵ",  "vi"),
    ("Ⅶ",  "vii"),
    ("Ⅷ",  "viii"),
    ("Ⅸ",  "ix"),
    ("Ⅹ",  "x"),
    ("Ⅺ",  "xi"),
    ("Ⅻ",  "xii"),
]
def pick_suffix(n):
    if n < len(SUFFIX_LIST): return SUFFIX_LIST[n]
    return (f"({n})", f"{n}")

def head_r2(key):
    try:
        with urlopen(Request(f"{R2_PUB}/{key}", method="HEAD"), timeout=8) as r:
            return r.status == 200 and int(r.headers.get("Content-Length") or 0) > 0
    except (HTTPError, URLError):
        return False
    except Exception:
        return False

def r2_put(local, key, ct):
    if DRY:
        return True, "dry"
    r = subprocess.run(
        ["npx", "wrangler", "r2", "object", "put", f"{R2_BUCKET}/{key}",
         "--file", str(local), "--content-type", ct, "--remote"],
        capture_output=True, text=True, cwd=ROOT,
    )
    return ("Upload complete" in r.stdout, (r.stderr or r.stdout)[:200])

def r2_delete(key):
    if DRY:
        return True
    r = subprocess.run(
        ["npx", "wrangler", "r2", "object", "delete", f"{R2_BUCKET}/{key}", "--remote"],
        capture_output=True, text=True, cwd=ROOT,
    )
    return r.returncode == 0

def split_slug_id(slug):
    """slug は `<base>_<idhash>` の形式。末尾 _xxxxxxxx を分離。"""
    if "_" in slug:
        base, _, tail = slug.rpartition("_")
        if len(tail) == 8 and all(c.isalnum() for c in tail):
            return base, tail
    return slug, ""

def rewrite_paths(song, new_slug):
    """audio/image のディレクトリは genre 別なので維持し、末尾ファイル名だけ差し替え。"""
    for key, ext in (("audio", ".mp3"), ("image", ".jpeg")):
        old = song.get(key) or ""
        if not old: continue
        dirpart, _, fname = old.rpartition("/")
        new_fname = new_slug + ext
        song[key] = f"{dirpart}/{new_fname}" if dirpart else new_fname

def main():
    with open(DATA_FILE) as f:
        songs = json.load(f)

    title_count = {}
    actions = []
    skipped_already = 0

    for idx, s in enumerate(songs):
        t = (s.get("title") or "").strip()
        if not t: continue
        # 既に Ⅱ〜Ⅻ / (n) のサフィックス付きはスキップ（冪等）
        looks_renamed = any(t.endswith(f" {r}") for r, _ in SUFFIX_LIST if r) or (t.endswith(")") and " (" in t)
        if looks_renamed:
            skipped_already += 1
            continue

        title_count[t] = title_count.get(t, 0) + 1
        n = title_count[t]
        if n == 1: continue

        roman, ascii_suffix = pick_suffix(n)
        new_title = f"{t} {roman}"
        base, idhash = split_slug_id(s.get("slug") or "")
        new_slug = f"{base}-{ascii_suffix}" + (f"_{idhash}" if idhash else "")

        action = {
            "idx": idx,
            "old_title": t, "new_title": new_title,
            "old_slug": s.get("slug"), "new_slug": new_slug,
            "old_audio": s.get("audio"), "old_image": s.get("image"),
            "genre": s.get("genre"),
        }
        tmp = dict(s)
        rewrite_paths(tmp, new_slug)
        action["new_audio"] = tmp.get("audio")
        action["new_image"] = tmp.get("image")
        actions.append(action)

    print(f"重複タイトル検出: {len(actions)} 曲を変更 (DRY={DRY}, 既存サフィックスありスキップ={skipped_already})")
    if not actions:
        return

    for a in actions[:10]:
        print(f"  [{a['old_title']:30s}] -> [{a['new_title']}]")
        print(f"     slug:  {a['old_slug']}  ->  {a['new_slug']}")
        print(f"     audio: {a['old_audio']}  ->  {a['new_audio']}")
        print(f"     image: {a['old_image']}  ->  {a['new_image']}")
    if len(actions) > 10:
        print(f"  ... 他 {len(actions)-10} 曲")

    if DRY:
        print("\n--dry-run のため変更しません")
        return

    print("\n=== ファイルリネーム + R2 同期 ===")
    fails = []
    for a in actions:
        # 1. ローカルファイル rename
        for kind, old_p, new_p in [("audio", a["old_audio"], a["new_audio"]),
                                    ("image", a["old_image"], a["new_image"])]:
            if not old_p or old_p == new_p: continue
            old_abs = ROOT / old_p
            new_abs = ROOT / new_p
            if old_abs.exists():
                if new_abs.exists():
                    print(f"  ! {kind} new exists, skip rename: {new_p}")
                else:
                    try:
                        shutil.move(str(old_abs), str(new_abs))
                        print(f"  ✓ local {kind}: {old_p}  ->  {new_p}")
                    except Exception as e:
                        print(f"  ! local {kind} rename failed: {e}")
                        fails.append((a["old_slug"], kind, str(e)))
            else:
                print(f"  ! local {kind} not found: {old_p}")

        # 2. R2 put (new key) → delete (old key)
        for kind, old_p, new_p, ct in [
            ("audio", a["old_audio"], a["new_audio"], "audio/mpeg"),
            ("image", a["old_image"], a["new_image"], "image/jpeg"),
        ]:
            if not new_p or old_p == new_p: continue
            new_abs = ROOT / new_p
            if not new_abs.exists():
                print(f"  ! cannot upload missing local {kind}: {new_p}")
                fails.append((a["old_slug"], kind, "missing local"))
                continue
            if head_r2(new_p):
                print(f"  · R2 {kind} skip (already): {new_p}")
            else:
                ok, msg = r2_put(new_abs, new_p, ct)
                if ok:
                    print(f"  ✓ R2 {kind} put: {new_p}")
                else:
                    print(f"  ! R2 {kind} put FAIL {new_p}: {msg}")
                    fails.append((a["old_slug"], kind, msg))
            if r2_delete(old_p):
                print(f"  ✓ R2 {kind} delete old: {old_p}")
            else:
                print(f"  · R2 {kind} delete old: skipped/fail {old_p}")

        # 3. index 更新
        s = songs[a["idx"]]
        s["title"] = a["new_title"]
        s["slug"]  = a["new_slug"]
        s["audio"] = a["new_audio"]
        s["image"] = a["new_image"]

    backup = DATA_FILE.with_suffix(".json.bak.dedupe")
    shutil.copy(DATA_FILE, backup)
    with open(DATA_FILE, "w") as f:
        json.dump(songs, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\n✅ index.json を更新（backup: {backup.name}）")

    print("=== index.json を R2 へ反映 ===")
    for local, key, ct in [
        (DATA_FILE, "data/index.json", "application/json"),
        (GENRES_FILE, "data/genres.json", "application/json"),
    ]:
        if local.exists():
            ok, msg = r2_put(local, key, ct)
            print(f"  {key}: {'ok' if ok else 'FAIL: ' + str(msg)}")

    if fails:
        print(f"\n失敗 {len(fails)} 件:")
        for slug, kind, msg in fails:
            print(f"  {slug}  {kind}  {msg}")

if __name__ == "__main__":
    main()
