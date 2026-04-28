#!/usr/bin/env python3
"""
Read data/suno_clips.json and produce site-ready metadata:
  - data/songs.json      : enriched entries with genre + slug + file paths
  - data/songs.csv       : spreadsheet-friendly mirror
  - data/genres.json     : {genre: count}
Also create empty genre directories under audio/ and images/.
"""
import json, os, re, csv, collections, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC  = os.path.join(ROOT, "data", "suno_clips.json")

GENRE_RULES = [
    ("lo-fi",               ["lo-fi", "lofi", "chillhop", "chill hop"]),
    ("ambient",             ["ambient", "drone", "soundscape"]),
    ("jazz",                ["jazz", "bossa", "neo soul", "neo-soul", "swing", "blues"]),
    ("cinematic",           ["cinematic", "orchestral", "film score", "soundtrack",
                             "classical", "epic", "trailer"]),
    ("electronic",          ["electronic", "edm", "synthwave", "future bass", "house",
                             "techno", "trance", "dubstep", "chiptune", "8bit", "8-bit",
                             "idm", "dnb", "drum and bass"]),
    # childrens BEFORE j-pop/pop/folk — tags like "children's instrumental pop" must not
    # fall through to the "pop" rule
    ("childrens",           ["children", "children's", "kids", "nursery", "lullaby",
                             "toybox", "toy box", "toy piano", "marimba parade",
                             "playful ukulele", "cartoon"]),
    ("j-pop",               ["j-pop", "jpop", "city pop", "citypop", "acoustic pop",
                             "ballad", "pop rock", "pop-rock", "idol", "indie pop"]),
    ("folk-acoustic",       ["folk", "acoustic", "country", "americana", "bluegrass"]),
    ("pop",                 ["pop"]),  # generic pop fallback — MUST stay after childrens/j-pop/folk
    ("hip-hop-rnb",         ["hip hop", "hip-hop", "hiphop", "trap", "r&b", "rnb", "soul"]),
    ("rock",                ["rock", "punk", "metal", "emo", "grunge", "alternative"]),
    ("japanese-anime",      ["japanese traditional", "japanese festival",
                             "japanese documentary", "anime", "shakuhachi", "koto",
                             "taiko", "enka"]),
    ("corporate-bgm",       ["corporate", "documentary", "business"]),
]
FALLBACK = "other"

def pick_genre(display_tags: str) -> str:
    t = (display_tags or "").lower()
    for name, kws in GENRE_RULES:
        for kw in kws:
            if kw in t:
                return name
    return FALLBACK

_slug_strip = re.compile(r"[^a-z0-9]+")
def slugify(text: str, maxlen: int = 60) -> str:
    # Normalize and drop non-ASCII letters; keep any latin substring.
    s = unicodedata.normalize("NFKD", text or "")
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.lower().strip()
    s = _slug_strip.sub("-", s).strip("-")
    if not s:
        s = "track"
    if len(s) > maxlen:
        s = s[:maxlen].rstrip("-")
    return s

def main():
    with open(SRC) as f:
        clips = json.load(f)

    # Dedupe by id (pagination can return overlapping pages)
    seen = set()
    unique = []
    for c in clips:
        if c["id"] in seen:
            continue
        seen.add(c["id"])
        unique.append(c)
    clips = unique

    rows = []
    genre_counts = collections.Counter()
    slug_counts  = collections.Counter()

    for c in clips:
        genre   = pick_genre(c.get("display_tags", ""))
        short   = (c["id"] or "")[:8]
        slug    = slugify(c.get("title", ""))
        base    = f"{slug}_{short}"
        slug_counts[base] += 1

        # duration: top-level (old API) → metadata.duration (new API v5.5+)
        meta     = c.get("metadata") or {}
        duration = c.get("duration") or meta.get("duration")

        # BPM: top-level avg_bpm (old) → parse from metadata.tags text (new)
        bpm = c.get("avg_bpm")
        if not bpm:
            import re as _re
            all_text = (meta.get("tags") or "") + " " + (c.get("display_tags") or "")
            m = _re.search(r"(\d{2,3})\s*bpm", all_text, _re.IGNORECASE)
            bpm = int(m.group(1)) if m else None

        # description: prefer gpt_description_prompt from metadata (new) over top-level
        description = (meta.get("gpt_description_prompt")
                       or c.get("gpt_description_prompt")
                       or "")

        row = {
            "id":          c["id"],
            "title":       c.get("title", ""),
            "slug":        base,
            "genre":       genre,
            "display_tags":c.get("display_tags", ""),
            "tags":        (meta.get("tags") or c.get("tags") or "")[:1000],
            "description": description,
            "prompt":      (c.get("prompt") or "")[:500],
            "duration":    duration,
            "bpm":         bpm,
            "model":       c.get("model_name") or c.get("model"),
            "created_at":  c.get("created_at"),
            "audio_url":   c.get("audio_url"),
            "image_url":   c.get("image_url"),
            "image_large_url": c.get("image_large_url"),
            "audio_path":  f"audio/{genre}/{base}.mp3",
            "image_path":  f"images/{genre}/{base}.jpeg",
        }
        rows.append(row)
        genre_counts[genre] += 1

    out_dir = os.path.join(ROOT, "data")
    os.makedirs(out_dir, exist_ok=True)

    with open(os.path.join(out_dir, "songs.json"), "w") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)

    with open(os.path.join(out_dir, "songs.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)

    with open(os.path.join(out_dir, "genres.json"), "w") as f:
        json.dump(dict(genre_counts.most_common()), f, ensure_ascii=False, indent=2)

    # Create folder scaffolding
    for g in genre_counts:
        os.makedirs(os.path.join(ROOT, "audio",  g), exist_ok=True)
        os.makedirs(os.path.join(ROOT, "images", g), exist_ok=True)

    # Write a download manifest (URL + local path), one line per resource
    with open(os.path.join(out_dir, "downloads.tsv"), "w") as f:
        for r in rows:
            if r["audio_url"]:
                f.write(f"{r['audio_url']}\t{r['audio_path']}\n")
            if r["image_large_url"] or r["image_url"]:
                f.write(f"{r['image_large_url'] or r['image_url']}\t{r['image_path']}\n")

    # Stats
    print(f"rows:            {len(rows)}")
    print(f"unique titles:   {len(set(r['title'] for r in rows))}")
    print(f"unique slugs:    {len(set(r['slug'] for r in rows))}")
    dup = {s:n for s,n in slug_counts.items() if n>1}
    print(f"duplicate slugs: {len(dup)} (collisions expected when same title w/ same id-prefix — use suffix if needed)")
    print("\n=== genre counts ===")
    for g, n in genre_counts.most_common():
        print(f"  {n:5d}  {g}")

if __name__ == "__main__":
    main()
