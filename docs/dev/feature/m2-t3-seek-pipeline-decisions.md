# M2-T3 seek/pipeline の設計決定と技術負債

## 現状

`crates/ygo-search/src/fs/{seek,pipeline}.rs` に TS 互換ラッパを実装した。

- `seek.rs`: `seek_cards(opts) -> Result<Vec<Card>>`（TS `seek-cards.ts`）
- `pipeline.rs`: `extract_card_patterns` / `extract_and_search_cards` / `judge_and_replace`
  （TS `pattern-extractor.ts` / `extract-and-search-cards.ts` / `judge-and-replace.ts`）

## 問題点（TS との差異・技術負債）

### 1. `seek_cards` の戻り値型と列投影

TS `seekCards` は `Record<string, string>[]`（動的カラム）を返し、
`cols` / `colAll` による列投影と detail-all.tsv のマージを行う。

Rust 版は設計書 §8.1 に従い固定スキーマの `Vec<Card>` を返すため:

- `cols` / `colAll` は **無視**（`Card` 全フィールドを返却）。列投影は TS 動的レコードモデル固有。
- detail-all.tsv のマージは行わない（`Card` に補足情報列が無い）。

選択セマンティクス（`max` / `random` / `range` / `all`）は忠実に再現している。

### 2. `PatternReplacer`（normalize）とのアルゴリズム重複

`normalize::replace::PatternReplacer::replace` は workers crate が使用する in-memory 版
（`MockCard`・英語警告）。`fs::pipeline::judge_and_replace` は fs 経由で実データを検索し、
TS 忠実な日本語警告・serde 型（`types::ReplacementResult`）を生成する。

両者で置換アルゴリズム構造（splice・status 決定・dedup）が重複するが、契約が異なるため
現時点では分離している。

### 3. `extract_card_patterns` の feature ゲート

`extract_card_patterns` は純粋関数（fs 不要）だが、`fs/pipeline.rs` に配置しているため
`fs` feature が無いと利用できない。純粋版が必要な場合は `normalize::PatternExtractor` を
直接使用可能。

## 改善案

- **1**: `Vec<Card>` でなく動的カラム型（`BTreeMap<String, String>` 等）を返す別関数を
  追加し、cols 投影・detail マージを完全再現するか、設計書を更新して現状を正式化する。
- **2**: カード型をジェネリック化（`trait CardLike`）し `PatternReplacer` と `pipeline` の
  置換コアを共通化する。workers を含めて一括移行が必要。
- **3**: `extract_card_patterns` を default（Layer A）へ切り出す。

## 優先度

low

## 関連

- タスク: TASK-13 `[M2-T3] seek/pipeline`
- 設計: `tmp/dev/plan/design.md` §8.1, §8.3, §9.3
- 関連ファイル: `crates/ygo-search/src/fs/{seek,pipeline}.rs`, `crates/ygo-search/src/normalize/replace.rs`
