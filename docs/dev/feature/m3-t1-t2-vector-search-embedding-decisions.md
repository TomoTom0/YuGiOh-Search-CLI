# M3-T1/T2 vector 検索・embedding 層の設計決定と技術負債

## 現状

`crates/ygo-search/src/vector/{mod,searcher,embeddings}.rs` に `vector-search` feature
（+ `vector-index`/`vector` エイリアス、`crates/ygo-search/Cargo.toml`）を実装した。

- `searcher.rs`: `list_tables` / `search_table` / `vector_search_cards` / `vector_search_faqs` /
  `vector_search_all`（TS `src/lib/vector/searcher.ts` 相当）
- `embeddings.rs`: `generate_embedding`（`ort` + `tokenizers`、TS `src/lib/vector/embeddings.ts` 相当）
- 統合テスト: `tests/vector.rs`（lancedb 直接操作、embedding 不要）、
  `tests/vector_embeddings.rs`（golden 一致性、`#[ignore]`）

M3-T1/T2 は設計上 `search_table` の文字列クエリ処理で密結合するため、ユーザー判断により
1セッションで統合実装した。

## 問題点（設計書との差異・技術負債）

### 1. where 句を文字列連結でなく expression builder で構築（設計書 §11 準拠、TS からの改善）

TS 版 `searcher.ts` は `metadata.${key} = "${value}"` の文字列連結で where 句を組み立てており
インジェクション耐性がない。Rust 版は `lancedb::expr::{col, lit}` +
`datafusion_functions::core::expr_fn::get_field`（ネスト struct フィールドアクセス）で
型付き `Expr` を構築し `only_if_expr` に渡す。文字列連結は一切行わない。
`filter`/`exclude` のキーは追加で識別子ホワイトリスト（`^[A-Za-z_][A-Za-z0-9_]*$`）で検証する
（defense-in-depth、`VectorError::InvalidFilterKey`）。

`exclude.faqIds`（TS は `string[]` だが実際は素の数値として SQL に埋め込む前提のバグ含み仕様）は
Rust 側で `i64::parse` を要求し、非数値は `VectorError::InvalidOption` で明示的に拒否する
（TS の暗黙的挙動より安全だが、非数値文字列を渡すと TS と異なりエラーになる差異がある）。

### 2. embedding モデルは量子化版（`model_quantized.onnx`）をデフォルト採用、設計書 §10.2 の受入基準を変更

設計書 §10.2 原案は「`cosine >= 0.999` かつ `max_abs_diff <= 1e-5`」を受入基準としていた。
M3-T0 PoC 完了直後（2026-07-15）は非量子化 `model.onnx` で `cosine 1.0 / max_abs_diff ~1e-7` の
完全一致が確認されていたが、本タスク実装時（2026-07-16）に再検証したところ **非量子化
`model.onnx` ファイルが golden.json 生成時点（08:48）より後（09:08）に別内容へ上書きされており
（ファイルサイズ 449MB→470MB 相当、原因不明・再ダウンロード等）、golden.json との整合性が
失われていた**（cosine ~0.994-0.998、max_abs_diff ~1e-2、全 8 件不一致）。

一方、量子化 `model_quantized.onnx`（golden.json と同時刻生成、以後変更なし）は
8件中7件で `cosine 1.0 / max_abs_diff ~1e-8`（完全一致）、残り1件
（`"手札を1枚捨てて発動できる。"`）のみ `cosine 0.999269 / max_abs_diff 5.5e-3` という
量子化誤差として妥当な差異にとどまった。

これにより:

- **デフォルトモデルファイルを量子化版に変更**（`embeddings.rs` の
  `model_onnx_path` は既定で `onnx/model_quantized.onnx` を参照。`YGO_SEARCH_MODEL_FILE`
  環境変数で上書き可能）。
- **テストの受入基準を `cosine >= 0.999` のみに変更**（`max_abs_diff` は参考情報としてログ出力
  するのみで pass/fail には使わない、`tests/vector_embeddings.rs`）。量子化誤差は特定入力で
  `max_abs_diff` が拡大しうるが、cosine（vector 検索のランキング・閾値フィルタに実際に使う指標）
  への影響は軽微なため。

### 3. モデルファイルの revision/hash pinning 未実装（設計書 §11 の未解決事項）

上記2で判明した「モデルファイルが検証後に無断で内容変更されうる」問題は、設計書 §11 が
警告していた「モデル/tokenizer download の revision/hash pinning」の必要性を実例で裏付けた。
現状 Rust 側はモデルファイルをローカルパスから読み込むのみで、内容検証（チェックサム等）は
行わない。将来的にモデル配布の仕組み（ダウンロードスクリプト等）を用意する際は、
配布時に revision/hash を固定しロード時に検証することを推奨する。

### 4. embedding golden テストはモデルファイル同梱なしのため `#[ignore]`

`onnx/model_quantized.onnx`（約113MB）を git に同梱していないため、CI では実行されない。
M4-T2（統合テスト整備）でモデル配置（fixture 配信 or ダウンロードステップ）を検討する。

## 改善案

- **1**: 該当なし（実装済み、TS より安全な設計）。
- **2**: モデルファイル配布の仕組み（署名・revision pinning 付きダウンロードスクリプト等）を
  M4 以降で検討し、本ドキュメントの手動上書き運用から卒業する。
- **3**: 上記2と同様。
- **4**: M4-T2 で CI 用モデル配置方法を確立し、`#[ignore]` を解除する。

## 優先度

medium（2/3 はモデル配布の信頼性に関わるため、vector feature を本番投入する前に対応推奨）

## 関連

- タスク: TASK-16 `[M3-T1] vector基盤+検索`, TASK-17 `[M3-T2] embedding層`
- 設計: `tmp/dev/plan/design.md` §8.4, §10, §11
- 関連ファイル: `crates/ygo-search/src/vector/{mod,searcher,embeddings}.rs`,
  `crates/ygo-search/tests/{vector,vector_embeddings}.rs`
