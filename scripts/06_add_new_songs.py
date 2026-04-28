#!/usr/bin/env python3
"""
06_add_new_songs.py
================================================================
新しいSuno曲をサイトに追加する全自動スクリプト。
01_prepare〜05_clean_mp3 の処理を新曲だけに絞って実行し、
最後に R2 へのアップロードまで完了させる。

使い方:
  python3 scripts/06_add_new_songs.py

必要なもの:
  - Chrome で Cloudflare ダッシュボードにログイン済み（Cookie認証）
  - ffmpeg が PATH に存在すること
  - pip3 install librosa requests Crypto  (初回のみ)

処理フロー:
  1. Suno API から最新クリップを取得 → suno_clips.json に追記
  2. 新曲（index.json 未収録 ID）だけを選別
  3. MP3・画像をダウンロード
  4. MP3 を ffmpeg でクリーンアップ（ノイズ軽減処理）
  5. BPM/尺を自動検出（metadata → librosa フォールバック）
  6. ジャンル・スラグ・英語メタデータを生成
  7. index.json + genres.json を更新
  8. Chrome Cookie から Cloudflare 認証トークンを取得
  9. 音声・画像・index.json を R2 にアップロード
================================================================
"""
import json, os, re, sys, time, shutil, subprocess, collections
import sqlite3, struct
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.parse import urlparse
from urllib.error import HTTPError

ROOT = Path(__file__).parent.parent
DATA_FILE   = ROOT / "data" / "index.json"
CLIPS_FILE  = ROOT / "data" / "suno_clips.json"
GENRES_FILE = ROOT / "data" / "genres.json"
AUDIO_DIR   = ROOT / "audio"
IMAGES_DIR  = ROOT / "images"
R2_BUCKET   = "bgm-data"
R2_PUB_URL  = "https://pub-c8052da2182b4317bc252b78e473584c.r2.dev"
CF_ACCOUNT  = "dec079cbb6f80e5bf626941e3f83844b"

# ── ジャンルルール（childrens は pop より前） ────────────────
GENRE_RULES = [
    ("lo-fi",         ["lo-fi", "lofi", "chillhop", "chill hop"]),
    ("ambient",       ["ambient", "drone", "soundscape"]),
    ("jazz",          ["jazz", "bossa", "neo soul", "neo-soul", "swing", "blues"]),
    ("cinematic",     ["cinematic", "orchestral", "film score", "soundtrack",
                       "classical", "epic", "trailer"]),
    ("electronic",    ["electronic", "edm", "synthwave", "future bass", "house",
                       "techno", "trance", "dubstep", "chiptune", "8bit", "8-bit"]),
    ("childrens",     ["children", "children's", "kids", "nursery", "lullaby",
                       "toybox", "toy box", "toy piano", "playful ukulele", "cartoon"]),
    ("j-pop",         ["j-pop", "jpop", "city pop", "citypop", "acoustic pop",
                       "ballad", "pop rock", "pop-rock", "idol", "indie pop"]),
    ("folk-acoustic", ["folk", "acoustic", "country", "americana", "bluegrass"]),
    ("pop",           ["pop"]),
    ("hip-hop-rnb",   ["hip hop", "hip-hop", "hiphop", "trap", "r&b", "rnb", "soul"]),
    ("rock",          ["rock", "punk", "metal", "emo", "grunge", "alternative"]),
    ("japanese-anime",["japanese traditional", "anime", "shakuhachi", "koto", "taiko", "enka"]),
    ("corporate-bgm", ["corporate", "documentary", "business"]),
]
GENRE_LABELS = {
    "lo-fi":         ("Lo-Fi",                    "Lo-Fi"),
    "ambient":       ("アンビエント",              "Ambient"),
    "jazz":          ("ジャズ",                   "Jazz"),
    "cinematic":     ("シネマティック",             "Cinematic"),
    "electronic":    ("エレクトロニック",           "Electronic"),
    "j-pop":         ("J-Pop",                   "J-Pop"),
    "pop":           ("ポップ",                   "Pop"),
    "hip-hop-rnb":   ("ヒップホップ・R&B",          "Hip-Hop / R&B"),
    "rock":          ("ロック",                   "Rock"),
    "folk-acoustic": ("フォーク・アコースティック",  "Folk / Acoustic"),
    "japanese-anime":("アニメ・日本風",             "Anime / Japanese"),
    "corporate-bgm": ("コーポレートBGM",           "Corporate BGM"),
    "childrens":     ("子供向け",                  "Children's"),
    "other":         ("その他",                   "Other"),
}
SLOW_GENRES = {"jazz", "lo-fi", "folk-acoustic", "ambient", "cinematic"}

_slug_strip = re.compile(r"[^a-z0-9]+")

def slugify(text, maxlen=60):
    import unicodedata
    s = unicodedata.normalize("NFKD", text or "")
    s = s.encode("ascii", "ignore").decode("ascii").lower().strip()
    s = _slug_strip.sub("-", s).strip("-")
    return (s or "track")[:maxlen].rstrip("-")

def pick_genre(tags):
    t = (tags or "").lower()
    for name, kws in GENRE_RULES:
        for kw in kws:
            if kw in t:
                return name
    return "other"

# ── BPM 検出 ──────────────────────────────────────────────────
def detect_bpm(mp3_path, genre):
    """librosa で BPM 検出。librosa がなければ None を返す。"""
    try:
        import librosa
        y, sr = librosa.load(str(mp3_path), duration=60, mono=True)
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = round(float(tempo))
        if bpm > 160 and genre in SLOW_GENRES:
            bpm = round(bpm / 2)
        elif bpm > 180:
            bpm = round(bpm / 2)
        return bpm
    except ImportError:
        print("  ⚠ librosa 未インストール。pip3 install librosa で BPM 検出可能")
        return None
    except Exception as e:
        print(f"  ⚠ BPM 検出失敗: {e}")
        return None

# ── Suno API ──────────────────────────────────────────────────
def get_suno_token():
    """Chrome の cookies DB から Suno JWT を復号して返す。"""
    import subprocess
    from Crypto.Cipher import AES
    from Crypto.Protocol.KDF import PBKDF2
    from Crypto.Hash import SHA1
    import hmac, hashlib

    key_pw = subprocess.check_output(
        ["security", "find-generic-password", "-w", "-a", "Chrome", "-s", "Chrome Safe Storage"],
        stderr=subprocess.DEVNULL
    ).strip()
    key = PBKDF2(key_pw, b"saltysalt", dkLen=16, count=1003,
                 prf=lambda p, s: hmac.new(p, s, SHA1).digest())

    for profile in ["Profile 1", "Default"]:
        db = Path.home() / "Library/Application Support/Google/Chrome" / profile / "Cookies"
        if not db.exists():
            continue
        tmp = Path("/tmp/suno_ck.db")
        shutil.copy(db, tmp)
        conn = sqlite3.connect(tmp)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT encrypted_value FROM cookies WHERE host_key LIKE '%.suno.com' AND name='__session' ORDER BY last_access_utc DESC LIMIT 1"
        )
        row = cursor.fetchone()
        conn.close()
        if not row:
            continue
        enc = row[0]
        if enc[:3] != b"v10":
            continue
        enc = enc[3:]
        iv = b" " * 16
        dec = AES.new(key, AES.MODE_CBC, iv).decrypt(enc)
        dec = dec[: -dec[-1]].decode("utf-8", errors="replace")
        idx = dec.find("eyJ")
        if idx >= 0:
            return dec[idx:]
    raise RuntimeError("Suno __session cookie が見つかりません。ChromeでSunoを開いてください。")

def fetch_suno_clips(token, pages=5):
    clips = []
    seen = set()
    for page in range(pages):
        url = f"https://studio-api.prod.suno.com/api/feed/?page={page}&page_size=20"
        req = Request(url, headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": "Mozilla/5.0",
            "Accept": "application/json",
        })
        try:
            with urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
        except HTTPError as e:
            if e.code == 401:
                raise RuntimeError("Suno トークン期限切れ。ChromeでSunoを再ログインしてください。")
            break
        batch = data if isinstance(data, list) else data.get("clips", data.get("data", []))
        if not batch:
            break
        for c in batch:
            if c["id"] not in seen:
                seen.add(c["id"])
                clips.append(c)
        time.sleep(0.3)
    return clips

# ── Cloudflare 認証 ────────────────────────────────────────────
def get_cf_token():
    """Chrome の cookies から Cloudflare vses2 セッション → API トークン作成。"""
    import hmac, hashlib
    from Crypto.Cipher import AES
    from Crypto.Protocol.KDF import PBKDF2
    from Crypto.Hash import SHA1
    from urllib.request import urlopen, Request
    import json as _json

    key_pw = subprocess.check_output(
        ["security", "find-generic-password", "-w", "-a", "Chrome", "-s", "Chrome Safe Storage"],
        stderr=subprocess.DEVNULL
    ).strip()
    key = PBKDF2(key_pw, b"saltysalt", dkLen=16, count=1003,
                 prf=lambda p, s: hmac.new(p, s, SHA1).digest())

    vses2 = None
    for profile in ["Profile 1", "Default"]:
        db = Path.home() / "Library/Application Support/Google/Chrome" / profile / "Cookies"
        if not db.exists():
            continue
        tmp = Path("/tmp/cf_ck.db")
        shutil.copy(db, tmp)
        conn = sqlite3.connect(tmp)
        cursor = conn.cursor()
        cursor.execute(
            "SELECT encrypted_value FROM cookies WHERE name='vses2' AND host_key LIKE '%dash.cloudflare%' ORDER BY last_access_utc DESC LIMIT 1"
        )
        row = cursor.fetchone()
        conn.close()
        if not row:
            continue
        enc = row[0]
        if enc[:3] != b"v10":
            continue
        enc = enc[3:]
        iv = b" " * 16
        dec = AES.new(key, AES.MODE_CBC, iv).decrypt(enc)
        dec = dec[: -dec[-1]].decode("utf-8", errors="replace")
        idx = dec.find("cfes-")
        if idx >= 0:
            vses2 = dec[idx:]
            break

    if not vses2:
        raise RuntimeError(
            "Cloudflare セッションが見つかりません。\n"
            "Chrome で https://dash.cloudflare.com を開いてログインしてください。"
        )

    # 有効期限は 3 時間
    import datetime
    expires = (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M:%SZ")
    body = _json.dumps({
        "name": f"BGM Upload {datetime.datetime.utcnow().strftime('%Y%m%d%H%M')}",
        "policies": [{
            "effect": "allow",
            "resources": {f"com.cloudflare.api.account.{CF_ACCOUNT}": "*"},
            "permission_groups": [
                {"id": "b4992e1108244f5d8bfbd5744320c2e1"},
                {"id": "bf7481a1826f439697cb59a20b22293e"},
                {"id": "6a018a9f2fc74eb6b293b0c548f38b39"},
                {"id": "2efd5506f9c8494dacb1fa10a3e7d5b6"},
            ],
        }],
        "expires_on": expires,
    }).encode()
    req = Request(
        "https://dash.cloudflare.com/api/v4/user/tokens",
        data=body,
        headers={"Cookie": f"vses2={vses2}", "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=15) as r:
        res = _json.loads(r.read())
    if not res.get("success"):
        raise RuntimeError(f"CF トークン作成失敗: {res.get('errors')}")
    return res["result"]["value"]

# ── R2 アップロード ────────────────────────────────────────────
def r2_upload(local_path, r2_key, content_type, cf_token):
    env = os.environ.copy()
    env["CLOUDFLARE_API_TOKEN"] = cf_token
    result = subprocess.run(
        ["npx", "wrangler", "r2", "object", "put", f"{R2_BUCKET}/{r2_key}",
         "--file", str(local_path), "--content-type", content_type, "--remote"],
        capture_output=True, text=True, env=env, cwd=ROOT
    )
    return "Upload complete" in result.stdout

# ── 英語メタデータ生成 ─────────────────────────────────────────
GENRE_EN = {
    "jazz": "Jazz", "ambient": "Ambient", "cinematic": "Cinematic",
    "lo-fi": "Lo-Fi", "pop": "Pop", "electronic": "Electronic",
    "rock": "Rock", "folk-acoustic": "Folk / Acoustic",
    "hip-hop-rnb": "Hip-Hop / R&B", "childrens": "Children's",
    "japanese-anime": "Anime / Japanese", "corporate-bgm": "Corporate BGM",
    "j-pop": "J-Pop", "other": "Other",
}
def build_desc_en(song):
    genre = GENRE_EN.get(song.get("genre", ""), song.get("genre", ""))
    tags  = [t.strip() for t in (song.get("tags") or "").split(",") if t.strip()]
    tags  = [t for t in tags if not re.match(r"^\d+\s*BPM", t, re.I)][:5]
    parts = []
    if genre: parts.append(f"{genre} BGM")
    if tags:  parts.append(", ".join(tags))
    if song.get("bpm"): parts.append(f"BPM {round(song['bpm'])}")
    return " · ".join(parts) or "Free BGM"

def build_title_en(title):
    """日本語タイトルを英語スラグベースから生成（フォールバック）。"""
    slug = slugify(title)
    if slug == "track":
        return title
    return " ".join(w.capitalize() for w in slug.split("-"))

# ── メイン処理 ─────────────────────────────────────────────────
def main():
    print("=" * 60)
    print("  新曲追加スクリプト")
    print("=" * 60)

    # 既存データ読み込み
    existing = json.loads(DATA_FILE.read_text()) if DATA_FILE.exists() else []
    existing_ids = {s["id"] for s in existing}
    clips_all = json.loads(CLIPS_FILE.read_text()) if CLIPS_FILE.exists() else []

    # ── 1. Suno API から最新クリップ取得 ─────────────────────
    print("\n[1/9] Suno API から最新クリップ取得...")
    try:
        token = get_suno_token()
        new_clips = fetch_suno_clips(token, pages=5)
        print(f"  取得: {len(new_clips)} クリップ")
    except Exception as e:
        print(f"  ⚠ Suno 取得失敗: {e}")
        print("  既存の suno_clips.json を使用します")
        new_clips = []

    # clips_all に追記（重複排除）
    clips_by_id = {c["id"]: c for c in clips_all}
    added_count = 0
    for c in new_clips:
        if c["id"] not in clips_by_id:
            clips_by_id[c["id"]] = c
            added_count += 1
    clips_all = list(clips_by_id.values())
    if added_count:
        CLIPS_FILE.write_text(json.dumps(clips_all, ensure_ascii=False))
        print(f"  suno_clips.json に {added_count} 件追加")

    # ── 2. 新曲だけを選別 ─────────────────────────────────────
    new_songs_raw = [c for c in clips_all if c["id"] not in existing_ids]
    if not new_songs_raw:
        print("\n✅ 新曲なし。処理を終了します。")
        return
    print(f"\n[2/9] 新曲: {len(new_songs_raw)} 曲")

    # ── 3. ダウンロード ────────────────────────────────────────
    print("\n[3/9] MP3・画像をダウンロード...")
    new_entries = []
    for c in new_songs_raw:
        meta     = c.get("metadata") or {}
        genre    = pick_genre(c.get("display_tags", ""))
        short    = (c["id"] or "")[:8]
        slug     = slugify(c.get("title", ""))
        base     = f"{slug}_{short}"
        audio_path  = ROOT / f"audio/{genre}/{base}.mp3"
        image_path  = ROOT / f"images/{genre}/{base}.jpeg"

        audio_path.parent.mkdir(parents=True, exist_ok=True)
        image_path.parent.mkdir(parents=True, exist_ok=True)

        # MP3 ダウンロード
        if not audio_path.exists():
            url = c.get("audio_url", "")
            if url:
                print(f"  ↓ {base}.mp3", end=" ")
                try:
                    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
                    with urlopen(req, timeout=30) as r:
                        audio_path.write_bytes(r.read())
                    print("✔")
                except Exception as e:
                    print(f"✘ {e}")
            else:
                print(f"  ✘ {base}: audio_url なし")
        else:
            print(f"  ✓ {base}.mp3 (既存)")

        # 画像ダウンロード
        if not image_path.exists():
            url = c.get("image_large_url") or c.get("image_url", "")
            if url:
                try:
                    req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
                    with urlopen(req, timeout=15) as r:
                        image_path.write_bytes(r.read())
                except Exception as e:
                    print(f"  ✘ {base}.jpeg: {e}")

        new_entries.append({
            "c": c, "meta": meta, "genre": genre,
            "base": base, "audio_path": audio_path, "image_path": image_path,
        })

    # ── 4. MP3 クリーンアップ ──────────────────────────────────
    print("\n[4/9] MP3 クリーンアップ（ffmpeg）...")
    ffmpeg = shutil.which("ffmpeg") or os.path.expanduser("~/.local/bin/ffmpeg")
    if not os.path.exists(ffmpeg):
        print("  ⚠ ffmpeg が見つかりません。スキップします。")
    else:
        for e in new_entries:
            mp3 = e["audio_path"]
            tmp = mp3.with_suffix(".tmp.mp3")
            if mp3.exists() and mp3.stat().st_size > 10_000:
                result = subprocess.run(
                    [ffmpeg, "-y", "-i", str(mp3),
                     "-af", "adelay=50|50,afade=t=in:d=0.02,apad=pad_dur=0.04",
                     "-codec:a", "libmp3lame", "-q:a", "2", str(tmp)],
                    capture_output=True
                )
                if result.returncode == 0 and tmp.exists():
                    shutil.move(str(tmp), str(mp3))
                else:
                    tmp.unlink(missing_ok=True)

    # ── 5. BPM・尺 検出 ──────────────────────────────────────
    print("\n[5/9] BPM・尺 を検出...")
    bpm_re = re.compile(r"(\d{2,3})\s*bpm", re.IGNORECASE)
    for e in new_entries:
        c, meta, genre = e["c"], e["meta"], e["genre"]

        duration = c.get("duration") or meta.get("duration")
        if duration:
            duration = round(float(duration), 2)

        all_text = (meta.get("tags") or "") + " " + (c.get("display_tags") or "")
        m = bpm_re.search(all_text)
        bpm = int(m.group(1)) if m else None

        if bpm is None and e["audio_path"].exists():
            print(f"  librosa 検出: {e['base']}...", end=" ", flush=True)
            bpm = detect_bpm(e["audio_path"], genre)
            print(f"→ {bpm} BPM" if bpm else "→ 不明")

        e["duration"] = duration
        e["bpm"]      = bpm

    # ── 6. メタデータ構築 ─────────────────────────────────────
    print("\n[6/9] メタデータ生成...")
    slug_counts = collections.Counter(s["slug"] for s in existing)
    songs_to_add = []

    for e in new_entries:
        c, meta, genre = e["c"], e["meta"], e["genre"]
        base = e["base"]
        slug_counts[base] += 1
        # 重複スラグには連番
        final_base = base if slug_counts[base] == 1 else f"{base}_{slug_counts[base]}"

        description = (meta.get("gpt_description_prompt")
                       or c.get("gpt_description_prompt") or "")
        display_tags = c.get("display_tags", "")
        tags_text    = meta.get("tags") or c.get("tags") or display_tags

        song = {
            "id":          c["id"],
            "slug":        final_base,
            "title":       c.get("title", ""),
            "genre":       genre,
            "description": description,
            "tags":        display_tags,
            "duration":    e["duration"],
            "bpm":         e["bpm"],
            "model":       c.get("model_name") or c.get("model"),
            "created_at":  c.get("created_at"),
            "audio":       f"audio/{genre}/{final_base}.mp3",
            "image":       f"images/{genre}/{final_base}.jpeg",
        }
        # 英語メタデータ
        song["title_en"] = build_title_en(song["title"])
        song["desc_en"]  = build_desc_en(song)
        songs_to_add.append(song)
        print(f"  ✔ {final_base}  genre={genre}  bpm={e['bpm']}  dur={e['duration']}")

    # ── 7. index.json・genres.json 更新 ───────────────────────
    print(f"\n[7/9] index.json 更新 ({len(existing)} → {len(existing)+len(songs_to_add)} 曲)...")
    updated = existing + songs_to_add
    DATA_FILE.write_text(json.dumps(updated, ensure_ascii=False))

    genres_data = json.loads(GENRES_FILE.read_text()) if GENRES_FILE.exists() else []
    genre_cnt = collections.Counter(s["genre"] for s in updated)
    for g in genres_data:
        if g["slug"] in genre_cnt:
            g["count"] = genre_cnt[g["slug"]]
    GENRES_FILE.write_text(json.dumps(genres_data, ensure_ascii=False, indent=2))
    print(f"  genres.json 更新完了")

    # ── 8. Cloudflare 認証 ───────────────────────────────────
    print("\n[8/9] Cloudflare 認証トークン取得...")
    try:
        cf_token = get_cf_token()
        print("  ✔ APIトークン取得成功")
        os.environ["CLOUDFLARE_API_TOKEN"] = cf_token
    except Exception as e:
        print(f"  ✘ {e}")
        print("  R2 アップロードをスキップします。")
        print(f"\n✅ 完了（R2 除く）: {len(songs_to_add)} 曲追加")
        return

    # ── 9. R2 アップロード ────────────────────────────────────
    print(f"\n[9/9] R2 アップロード ({len(songs_to_add)*2 + 1} ファイル)...")
    ok = fail = 0
    for e in new_entries:
        # MP3
        r2_key = f"audio/{e['genre']}/{e['base']}.mp3"
        if e["audio_path"].exists():
            if r2_upload(e["audio_path"], r2_key, "audio/mpeg", cf_token):
                print(f"  ✔ {r2_key}"); ok += 1
            else:
                print(f"  ✘ {r2_key}"); fail += 1
        # 画像
        r2_key = f"images/{e['genre']}/{e['base']}.jpeg"
        if e["image_path"].exists():
            if r2_upload(e["image_path"], r2_key, "image/jpeg", cf_token):
                ok += 1
            else:
                print(f"  ✘ {r2_key}"); fail += 1

    # index.json を R2 にも反映
    if r2_upload(DATA_FILE, "data/index.json", "application/json", cf_token):
        print("  ✔ data/index.json"); ok += 1
    else:
        print("  ✘ data/index.json"); fail += 1

    print(f"\n{'='*60}")
    print(f"✅ 完了！  追加: {len(songs_to_add)} 曲  R2: {ok}成功/{fail}失敗")
    print(f"  次は git add data/ && git commit && git push をしてください")
    print(f"{'='*60}")

if __name__ == "__main__":
    main()
