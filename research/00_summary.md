# フリーBGMサイト調査まとめ

> 2026-04-25 作成 / 起きたら読む用サマリ。詳細は同フォルダの個別ファイル参照。

## TL;DR — 日本一を狙うために重要だと感じた5点

1. **DOVA-SYNDROMEが寡占状態**（月間50万UU、YouTube登録65万、TikTok月間視聴30億回、約18,700曲、作曲者256名）。正面から「曲数」で勝つのは無理。**質×検索体験×AI時代の規約明確さ**で差別化する。
2. **ユーザーの一番の痛点は「探しにくい」**。BPM・尺・ムード・用途（Vlog/ゲーム実況/朝/夜）の多軸絞り込みが弱いサイトが多い。ここは技術的に勝てる。
3. **AI生成楽曲はフリーBGM協会の加盟サイト群でグレー扱い**（魔王魂は「AI作曲システムへの組込み」を禁止しているが利用は可、各サイト規約バラバラ）。**Suno生成だと正直に明示し、商用利用条件を1ページで明確化**するのは差別化どころか必須。
4. **同じユーザーが何曲もまとめて欲しい**。「お気に入り保存」「ZIP一括DL」「YouTubeセーフリスト的な機能」が国内サイトはほぼ未整備。Uppbeatが先進。
5. **収益化はAdSense一択ではない**。曲ページのPVが命なので、ジャンル/ムード/BPMで深いランディングを量産しSEOを取る。後述の「ロングテール戦略」が王道。

## 現状の手持ちリソース

- 2,070曲 / 14ジャンル（メモ上は3,140クリップ・814タイトルだが、READMEは2070でリリース版数値の差はSuno変奏分の整理結果）
- 各曲: title / genre / description / tags / duration / **bpm** / cover image / audio
- BPM・尺・タグが既に揃っているのは強い武器（多くの既存サイトは尺すら出してない）

## このフォルダの構成

- `00_summary.md` ← 今ここ
- `01_competitors.md` 主要サイト比較（DOVA / 魔王魂 / 甘茶 / BGMer / MusMus / HURT RECORD / Pocket Sound / Wingless Seraph）
- `02_global_competitors.md` Pixabay Music / Uppbeat / Artlist / SoundCloud
- `03_ux_findings.md` UI/UX 観察と「日本一にするための要件定義」案
- `04_seo_traffic.md` SEO・集客戦略
- `05_monetization.md` 収益化モデル
- `06_ai_legal.md` AI生成楽曲・Suno規約・フリーBGM協会との整合
- `07_differentiation.md` 差別化ポイント／プロダクト案
- `08_tech_stack.md` 技術スタック検討（Next.js / wavesurfer.js / Howler.js）

## 次にやるべきこと（提案・実装はまだしない）

1. **コンセプト確定**：「Suno発の高音質フリーBGM。BPM・尺・ムードで秒で見つかる」あたりを軸に
2. **ドメイン仮押さえ**：`-bgm.jp` `freebgm-` `bgmlibrary` 系で短く覚えやすいもの
3. **MVP範囲決め**：トップ／ジャンルページ／ムードページ／曲詳細／検索の5画面
4. **規約ページの先行起草**：協会基準＋AI明示でクリーンに
5. **YouTube Content ID / Tracks.ink を使うか決める**（Suno規約と二重請求のリスク確認）
