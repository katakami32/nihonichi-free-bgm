#!/usr/bin/env python3
"""
10_post_upload_check.py
================================================================
新曲追加後の必須チェック・自動修正スクリプト。
06_add_new_songs.py の末尾から自動呼び出しされる。
単独実行も可能: python3 scripts/10_post_upload_check.py

実行内容:
  1. data/by-genre/*.json を index.json から再生成
  2. genres.json のスキーマ・count を検証・修正
  3. 重複タイトルを検出して報告
  4. SEO個別ページ（songs/*.html）の未生成を検出・補完
  5. sitemap.xml を更新
  6. sw.js のキャッシュバージョンを自動インクリメント
  7. 最終整合性サマリーを表示
================================================================
"""
import json, os, re, subprocess, sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).parent.parent

INDEX_JSON   = ROOT / "data" / "index.json"
GENRES_JSON  = ROOT / "data" / "genres.json"
BY_GENRE_DIR = ROOT / "data" / "by-genre"
SONGS_DIR    = ROOT / "songs"
SW_JS        = ROOT / "sw.js"
SITEMAP_XML  = ROOT / "sitemap.xml"

REQUIRED_GENRE_FIELDS = ["slug", "label_ja", "label_en", "count", "cover"]

_errors   = []
_warnings = []
_fixed    = []

def _section(title):
    print(f"\n{'='*55}\n  {title}\n{'='*55}")

def _ok(msg):   print(f"  ✅ {msg}")
def _warn(msg): print(f"  ⚠️  {msg}"); _warnings.append(msg)
def _err(msg):  print(f"  ❌ {msg}"); _errors.append(msg)
def _fix(msg):  print(f"  🔧 {msg}"); _fixed.append(msg)


def step1_rebuild_by_genre(songs, genres):
    _section("Step 1: by-genre/*.json を再生成")
    BY_GENRE_DIR.mkdir(parents=True, exist_ok=True)

    by_genre = {}
    for s in songs:
        g = s.get("genre") or "other"
        by_genre.setdefault(g, []).append(s)

    genre_slugs = {g["slug"] for g in genres}
    changed = 0

    for slug, song_list in by_genre.items():
        if slug not in genre_slugs:
            _warn(f"genres.json に未登録ジャンル: '{slug}' ({len(song_list)}曲)")
        out = BY_GENRE_DIR / f"{slug}.json"
        existing = json.loads(out.read_text()) if out.exists() else None
        if existing != song_list:
            out.write_text(json.dumps(song_list, ensure_ascii=False, indent=2))
            _fix(f"by-genre/{slug}.json 更新 ({len(song_list)}曲)")
            changed += 1

    # genres に存在するがデータが一件もないスラッグは空ファイルを保証
    for g in genres:
        slug = g["slug"]
        f = BY_GENRE_DIR / f"{slug}.json"
        if not f.exists():
            f.write_text("[]")
            _fix(f"by-genre/{slug}.json 新規作成（空）")
            changed += 1

    if changed == 0:
        _ok("by-genre/*.json はすべて最新")


def step2_validate_genres(songs, genres):
    _section("Step 2: genres.json スキーマ・count を検証・修正")
    song_counts = Counter(s.get("genre") or "other" for s in songs)
    changed = False

    for g in genres:
        missing = [k for k in REQUIRED_GENRE_FIELDS if k not in g]
        if missing:
            _err(f"'{g.get('slug','?')}' 欠損フィールド: {missing}")

        slug = g.get("slug", "")
        actual = song_counts.get(slug, 0)
        if g.get("count") != actual:
            _warn(f"'{slug}' count {g.get('count')} → {actual} に修正")
            g["count"] = actual
            changed = True

    if changed:
        GENRES_JSON.write_text(json.dumps(genres, ensure_ascii=False, indent=2))
        _fix("genres.json の count を修正・保存")
    else:
        _ok("genres.json スキーマ・count は正常")

    return genres


def step3_check_duplicates(songs):
    _section("Step 3: 重複タイトル検出")
    title_count = Counter(s.get("title", "") for s in songs)
    dupes = [(t, c) for t, c in title_count.items() if c > 2]
    if not dupes:
        _ok("重複タイトルなし")
        return
    for title, count in sorted(dupes, key=lambda x: -x[1]):
        _warn(f"重複 {count}件: 「{title}」")
    print("  → scripts/09_dedupe_rename.py で修正してください")


def step4_check_seo_pages(songs):
    _section("Step 4: SEO個別ページ確認・補完")
    if not SONGS_DIR.exists():
        _err("songs/ ディレクトリが存在しません")
        return

    existing = {p.stem for p in SONGS_DIR.glob("*.html")}
    missing = [s for s in songs if s.get("slug") and s["slug"] not in existing]

    if not missing:
        _ok(f"全 {len(songs)} 曲の SEOページ確認 OK")
        return

    _warn(f"SEOページ未生成: {len(missing)} 曲")
    for s in missing[:5]:
        print(f"    - {s['slug']}")
    if len(missing) > 5:
        print(f"    ... 他 {len(missing)-5} 件")

    print("  → generate-song-pages.js を実行して補完します...")
    result = subprocess.run(
        ["node", "scripts/generate-song-pages.js"],
        cwd=ROOT, capture_output=True, text=True
    )
    if result.returncode == 0:
        _fix(f"generate-song-pages.js 完了（{len(missing)}ページ補完）")
    else:
        _err(f"generate-song-pages.js 失敗:\n{result.stderr[:300]}")


def step5_update_sitemap():
    _section("Step 5: sitemap.xml を更新")
    result = subprocess.run(
        ["node", "scripts/generate-sitemap.js"],
        cwd=ROOT, capture_output=True, text=True
    )
    if result.returncode == 0:
        count = SITEMAP_XML.read_text().count("<url>") if SITEMAP_XML.exists() else "?"
        _fix(f"sitemap.xml 更新完了（{count} エントリ）")
    else:
        _err(f"generate-sitemap.js 失敗:\n{result.stderr[:300]}")


def step6_bump_sw_version():
    _section("Step 6: sw.js キャッシュバージョン更新")
    if not SW_JS.exists():
        _warn("sw.js が見つかりません。スキップします。")
        return

    content = SW_JS.read_text()
    # bgm-v9 または bgm-cache-v9 どちらの形式にも対応
    match = re.search(r"(bgm-(?:cache-)?v)(\d+)", content)
    if not match:
        _warn("sw.js にキャッシュバージョンパターンが見つかりません。スキップします。")
        return

    prefix  = match.group(1)
    old_ver = int(match.group(2))
    new_ver = old_ver + 1
    SW_JS.write_text(content.replace(f"{prefix}{old_ver}", f"{prefix}{new_ver}"))
    _fix(f"sw.js キャッシュバージョン: {prefix}{old_ver} → {prefix}{new_ver}")


def step7_final_summary(songs, genres):
    _section("Step 7: 整合性 最終確認")
    song_counts = Counter(s.get("genre") or "other" for s in songs)
    all_ok = True
    for g in genres:
        slug = g["slug"]
        bf = BY_GENRE_DIR / f"{slug}.json"
        actual_by  = len(json.loads(bf.read_text())) if bf.exists() else -1
        actual_idx = song_counts.get(slug, 0)
        match = g["count"] == actual_by == actual_idx
        status = "✅" if match else "❌"
        print(f"  {status} {slug:22s} genres={g['count']:4d}  by-genre={actual_by:4d}  index={actual_idx:4d}")
        if not match:
            all_ok = False
    if all_ok:
        print(); _ok("全ジャンルの整合性 OK")
    else:
        print(); _err("整合性エラーあり → 手動確認が必要です")


def main():
    print("\n" + "="*55)
    print("  新曲追加後チェック・自動修正スクリプト")
    print("="*55)

    if not INDEX_JSON.exists():
        print(f"❌ {INDEX_JSON} が存在しません。終了します。")
        sys.exit(1)

    songs  = json.loads(INDEX_JSON.read_text())
    genres = json.loads(GENRES_JSON.read_text()) if GENRES_JSON.exists() else []
    print(f"\n  index.json: {len(songs)} 曲  /  genres.json: {len(genres)} ジャンル")

    step1_rebuild_by_genre(songs, genres)
    genres = step2_validate_genres(songs, genres)
    step3_check_duplicates(songs)
    step4_check_seo_pages(songs)
    step5_update_sitemap()
    step6_bump_sw_version()
    step7_final_summary(songs, genres)

    # ── 最終レポート ──────────────────────────────────────────
    _section("完了サマリー")
    if _fixed:
        print(f"  自動修正: {len(_fixed)} 件")
        for f in _fixed:
            print(f"    🔧 {f}")
    if _warnings:
        print(f"\n  警告: {len(_warnings)} 件")
        for w in _warnings:
            print(f"    ⚠️  {w}")
    if _errors:
        print(f"\n  エラー: {len(_errors)} 件（手動対応が必要）")
        for e in _errors:
            print(f"    ❌ {e}")

    print(f"\n  現在の曲数: {len(songs)} 曲")
    print(f"  → index.html と CLAUDE.md の曲数を {len(songs)} に更新してください（手動）")
    print()
    print("  次のステップ:")
    print(f"    git add data/ songs/ sitemap.xml sw.js")
    print(f"    git commit -m 'feat: 新曲追加（合計{len(songs)}曲）'")
    print(f"    git push origin main")
    print()

    if _errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
