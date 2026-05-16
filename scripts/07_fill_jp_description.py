#!/usr/bin/env python3
"""
07_fill_jp_description.py
================================================================
data/index.json の description が空の曲に、ジャンル/タグ/BPMベースで
日本語キーワード列を生成して埋める。

これにより AI任せ / BGMチャンネル / NAVIちゃん / 通常検索の
ヒット率を確保する（フロント検索は tags + description + genre を
連結してマッチするため、空欄だと一切ヒットしない）。

使い方:
  python3 scripts/07_fill_jp_description.py            # description 空のみ補完
  python3 scripts/07_fill_jp_description.py --force    # すべて上書き
================================================================
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
DATA_FILE = ROOT / "data" / "index.json"

FORCE = "--force" in sys.argv

# ジャンル → 基本キーワード（既存曲のdesc傾向に揃える）
GENRE_BASE = {
    "lo-fi":          ["ローファイヒップホップ", "落ち着いた雰囲気", "Vlog・日常動画向けBGM", "耳心地よいコード進行"],
    "ambient":        ["アンビエント", "癒し・瞑想向けBGM", "広がりのある音像", "睡眠・作業用BGM"],
    "jazz":           ["ジャズ", "カフェBGM", "落ち着いた大人の雰囲気", "おしゃれな動画向け"],
    "cinematic":      ["シネマティック", "壮大なオーケストラ", "映像作品向けBGM", "感動的な展開"],
    "electronic":     ["エレクトロニック", "ダンサブルでパワフル", "ゲーム・スポーツ動画向けBGM", "未来的なシンセサウンド"],
    "j-pop":          ["J-Pop", "明るくポップ", "日本人YouTuber向けBGM", "元気でわくわく"],
    "pop":            ["アップテンポで明るい", "ポップBGM", "Vlog・SNSショート動画向け", "キャッチーで耳に残る"],
    "hip-hop-rnb":    ["ヒップホップ・R&B", "グルーヴ感のあるビート", "ストリート系映像向け", "ソウルフルな雰囲気"],
    "rock":           ["ロック", "疾走感あふれるサウンド", "スポーツ・アクション動画向け", "パワフルなギター"],
    "folk-acoustic":  ["フォーク・アコースティック", "温かみのある音色", "旅行・自然映像向けBGM", "アコースティックギター"],
    "japanese-anime": ["和風・アニメ系BGM", "日本の情緒", "アニメ映像向け", "ドラマチックな展開"],
    "corporate-bgm":  ["コーポレートBGM", "プロフェッショナルな雰囲気", "企業VP・プレゼン向け", "クリーンで上品"],
    "childrens":      ["子供向け", "可愛らしく楽しい", "キッズ動画向けBGM", "明るく元気"],
    "other":          ["独創的なBGM", "ユニークなサウンド", "様々なシーンに対応", "多用途BGM"],
}

# BPM補強
def bpm_kw(bpm):
    if not bpm: return None
    bpm = int(bpm)
    if bpm < 70:   return "ゆったりとしたテンポ"
    if bpm < 90:   return "落ち着いたテンポ"
    if bpm < 110:  return "ミディアムテンポ"
    if bpm < 130:  return "やや速めのテンポ"
    if bpm < 150:  return "アップテンポ"
    if bpm < 180:  return "疾走感あるテンポ"
    return "高速テンポ"

# 英タグ → 日本語タグ（部分一致）
TAG_JP_MAP = [
    ("k-pop",        "K-Pop風"),
    ("electro-pop",  "エレクトロポップ"),
    ("dance pop",    "ダンスポップ"),
    ("dance-pop",    "ダンスポップ"),
    ("synthwave",    "シンセウェーブ"),
    ("synth-pop",    "シンセポップ"),
    ("synthpop",     "シンセポップ"),
    ("hyperpop",     "ハイパーポップ"),
    ("trap",         "トラップ"),
    ("future bass",  "フューチャーベース"),
    ("edm",          "EDM"),
    ("house",        "ハウス"),
    ("techno",       "テクノ"),
    ("trance",       "トランス"),
    ("dubstep",      "ダブステップ"),
    ("anthem",       "アンセム調"),
    ("dramatic",     "ドラマチック"),
    ("epic",         "壮大"),
    ("cinematic",    "シネマティック"),
    ("ballad",       "バラード"),
    ("acoustic",     "アコースティック"),
    ("piano",        "ピアノ中心"),
    ("guitar",       "ギター中心"),
    ("vocal",        "ボーカル入り"),
    ("instrumental", "インスト"),
    ("chill",        "チル"),
    ("upbeat",       "アップビート"),
    ("uplifting",    "高揚感"),
    ("emotional",    "感情豊か"),
    ("dark",         "ダーク"),
    ("bright",       "明るい"),
    ("retro",        "レトロ"),
    ("modern",       "モダン"),
    ("japanese",     "和風"),
]

def tags_to_jp(tags_text):
    if not tags_text: return []
    t = tags_text.lower()
    found = []
    for kw, jp in TAG_JP_MAP:
        if kw in t and jp not in found:
            found.append(jp)
    return found

def build_desc(song):
    genre = song.get("genre", "other") or "other"
    base = list(GENRE_BASE.get(genre, GENRE_BASE["other"]))
    extra = tags_to_jp(song.get("tags") or "")
    bk = bpm_kw(song.get("bpm"))
    # 重複排除しつつ最大6要素まで
    parts = []
    for p in extra + base + ([bk] if bk else []):
        if p and p not in parts:
            parts.append(p)
        if len(parts) >= 6: break
    return "、".join(parts)

def main():
    with open(DATA_FILE) as f:
        songs = json.load(f)
    filled = 0
    for s in songs:
        if not FORCE and (s.get("description") or "").strip():
            continue
        new_desc = build_desc(s)
        if new_desc and new_desc != (s.get("description") or ""):
            s["description"] = new_desc
            filled += 1
    if filled:
        with open(DATA_FILE, "w") as f:
            json.dump(songs, f, ensure_ascii=False, separators=(",", ":"))
        print(f"✅ {filled} 曲の description を補完しました")
    else:
        print("対象なし")

if __name__ == "__main__":
    main()
