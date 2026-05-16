#!/usr/bin/env python3
"""
08_upload_new_to_r2.py
================================================================
data/index.json の末尾N件（または全件）について、対応する音声と画像を
wrangler 経由で R2 バケット `bgm-data` にアップロードする。

既にR2に存在するキーは HEADでスキップ（冪等）。
最後に data/index.json と data/genres.json も R2 に反映。

06_add_new_songs.py 内蔵のR2アップロードは Chrome cookie 復号で
CFトークンを得る方式だが、Chrome 147 で暗号化形式が変わった影響で
失敗するため、wrangler の既存ログインを使う代替パスとして用意。

使い方:
  python3 scripts/08_upload_new_to_r2.py --last=51    # 末尾51件のみ
  python3 scripts/08_upload_new_to_r2.py              # 末尾51件（デフォルト）
  python3 scripts/08_upload_new_to_r2.py --all        # 全件チェック（冪等）
================================================================
"""
import json, sys, subprocess
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).parent.parent
DATA_FILE = ROOT / "data" / "index.json"
GENRES_FILE = ROOT / "data" / "genres.json"
R2_BUCKET = "bgm-data"
R2_PUB = "https://pub-c8052da2182b4317bc252b78e473584c.r2.dev"

LAST = 51
for a in sys.argv[1:]:
    if a.startswith("--last="):
        LAST = int(a.split("=")[1])
    elif a == "--all":
        LAST = None

def exists_on_r2(key):
    """R2 公開URLにHEADして存在チェック。"""
    try:
        req = Request(f"{R2_PUB}/{key}", method="HEAD")
        with urlopen(req, timeout=8) as r:
            return r.status == 200 and int(r.headers.get("Content-Length") or 0) > 0
    except (HTTPError, URLError):
        return False
    except Exception:
        return False

def r2_put(local_path, key, content_type):
    """wrangler で R2 にアップロード。"""
    r = subprocess.run(
        ["npx", "wrangler", "r2", "object", "put", f"{R2_BUCKET}/{key}",
         "--file", str(local_path), "--content-type", content_type, "--remote"],
        capture_output=True, text=True, cwd=ROOT,
    )
    ok = "Upload complete" in r.stdout
    if not ok:
        return False, (r.stderr or r.stdout)[:200]
    return True, "ok"

def upload_pair(song):
    """音声と画像をペアでアップロード。"""
    audio_path = ROOT / song["audio"]
    image_path = ROOT / song["image"]
    audio_key  = song["audio"]
    image_key  = song["image"]
    summary = {"slug": song["slug"], "audio": None, "image": None}

    # 音声
    if audio_path.exists():
        if exists_on_r2(audio_key):
            summary["audio"] = "skip"
        else:
            ok, msg = r2_put(audio_path, audio_key, "audio/mpeg")
            summary["audio"] = "ok" if ok else f"FAIL: {msg}"
    else:
        summary["audio"] = "missing-local"

    # 画像
    if image_path.exists():
        if exists_on_r2(image_key):
            summary["image"] = "skip"
        else:
            ok, msg = r2_put(image_path, image_key, "image/jpeg")
            summary["image"] = "ok" if ok else f"FAIL: {msg}"
    else:
        summary["image"] = "missing-local"

    return summary

def main():
    with open(DATA_FILE) as f:
        songs = json.load(f)

    targets = songs if LAST is None else songs[-LAST:]
    print(f"対象: {len(targets)} 曲")

    ok_audio = skip_audio = fail_audio = miss_audio = 0
    ok_image = skip_image = fail_image = miss_image = 0
    fails = []

    for i, s in enumerate(targets, 1):
        r = upload_pair(s)
        print(f"  [{i:>3}/{len(targets)}] {r['slug']:60s}  audio={r['audio']:12s}  image={r['image']}")
        if r["audio"] == "ok": ok_audio += 1
        elif r["audio"] == "skip": skip_audio += 1
        elif r["audio"] == "missing-local": miss_audio += 1
        else: fail_audio += 1; fails.append((r["slug"], "audio", r["audio"]))
        if r["image"] == "ok": ok_image += 1
        elif r["image"] == "skip": skip_image += 1
        elif r["image"] == "missing-local": miss_image += 1
        else: fail_image += 1; fails.append((r["slug"], "image", r["image"]))

    print()
    print(f"音声: ok={ok_audio}, skip={skip_audio}, fail={fail_audio}, missing={miss_audio}")
    print(f"画像: ok={ok_image}, skip={skip_image}, fail={fail_image}, missing={miss_image}")

    if fails:
        print("\n失敗:")
        for slug, kind, msg in fails:
            print(f"  {slug:60s}  {kind}  {msg}")

    # index.json / genres.json 反映
    print("\n=== index.json + genres.json を R2 へ ===")
    for local, key, ct in [
        (DATA_FILE, "data/index.json",  "application/json"),
        (GENRES_FILE, "data/genres.json", "application/json"),
    ]:
        if local.exists():
            ok, msg = r2_put(local, key, ct)
            print(f"  {key}: {'ok' if ok else f'FAIL: {msg}'}")
        else:
            print(f"  {key}: missing-local")

if __name__ == "__main__":
    main()
