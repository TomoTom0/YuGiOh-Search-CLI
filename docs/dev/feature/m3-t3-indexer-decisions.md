# M3-T3 index 構築（index_from_jsonl）の設計決定と技術負債

## 現状

`crates/ygo-search/src/vector/indexer.rs` に Vector DB 構築を実装した（`vector-search` feature 配下）。

- `index_from_jsonl(table, jsonl_path)`: jsonl 読込 → バッチ embedding → `lancedb::create_table`
  （TS `src/lib/vector/indexer.ts` の `indexFromJsonl` 相当）
- `create_index(table, records)`: TS `createIndex` 相当
- 補助: `parse_jsonl`（jsonl 行パース）、`build_record_batch`（Arrow `RecordBatch` 構築・純粋）
- `embeddings.rs` に `generate_embeddings(texts)` を追加（バッチ生成）
- 統合テスト: `tests/vector_indexer.rs`（`parse_jsonl`/`build_record_batch` は model 不要、
  `index_from_jsonl` end-to-end は `#[ignore]`）

## 問題点（設計書との差異・技術負債）

### 1. バッチ embedding は「チャンク単体推論」を採用（真バッチ融合推論は将来候補）

設計書・開発計画は「バッチ embedding(32)」と記載。TS `generateEmbeddings` は 32件を1度の
モデル forward に渡す融合バッチだが、Rust 版は golden 検証済みの `generate_embedding`（1件推論）
を BATCH_SIZE=32 のチャンクで順次呼び出す実装とした（ユーザー判断）。

理由: transformer の mean pooling は attention mask により系列独立で、チャンク単体の結果は
TS の融合バッチ結果と数学的に完全一致する。融合バッチは padding + attention mask の取り回しで
新規コード経路となり、バッチ固有の誤差が `cosine >= 0.999` の受入基準の背後に隠れうるリスクが
ある（PoC `tmp/dev/poc/vector-poc/rust/src/embed.rs` も単体推論のみで融合バッチ未検証）。
index 構築はオフライン・一回限りのため正確性を優先した。

代償: 大規模データ（本カード DB 最大約1.2万枚）で遅い（概算 1〜4 分）。頻繁に全量再構築する
ユースケースでは真バッチ化（融合推論）が性能改善になる。

### 2. metadata 列は推論 Arrow Struct（ネスト値は Utf8 の JSON 文字列化）

TS は `createTable(name, records)` で LanceDB JS に schema 推論させる。Rust 版は全レコードの
metadata キー和集合から Struct スキーマを自前で推論し `StructArray` を構築する
（int→Int64, float→Float64, bool→Boolean, string→Utf8, object/array→Utf8(JSON文字列)。
欠損キーは nullable）。これにより検索側 `get_field(metadata, key)`（searcher.rs）のフィルタが
Rust 構築 DB でも機能する。

制約: ネストした object/array 値は JSON 文字列として格納するため、ネスト先キーでの
メタデータフィルタはできない。実データ（cards/faqs はフラット）では影響なし。generic 変換で
ネストが入りうる場合は文字列検索相当になる。

### 3. 上書き作成は `CreateTableMode::Overwrite`（TS の drop→create を統合）

TS は `tableNames()` で存在確認→`dropTable()`→`createTable()` と3段階。Rust 版は
`db.create_table(name, vec![batch]).mode(CreateTableMode::Overwrite).execute()` の1呼び出し
（lancedb 0.31）で等価。挙動は同一。

### 4. feature ゲートは `vector-search` 配下（設計の依存図 C-index→B-fs から簡略化）

設計書は `vector-index = [fs, vector-search]` を index 構築の feature としていた。しかし
indexer の jsonl 読込は `std::fs` + `serde_json` の inline（TS と同一）で `fs` feature
（TSV 読込・キャッシュ・フィルタ）には依存しない。そのため indexer は `vector-search` 配下に
置き、`fs` を必須としない。`vector-index`/`vector` エイリアスは `vector-search` を含むため
そのまま機能する（TSV→jsonl 変換＋構築のフルワークフロー用途）。

### 5. 空入力はエラー

`create_index` に空レコードを渡すと `VectorError::IndexBuild` を返す（TS は空テーブル作成を
試み lancedb エラーになる可能性）。Rust 版は明示的にガードする。

### 6. connect_db / runtime を mod.rs へ共有化（searcher と重複排除）

`connect_db()`・`runtime()`（tokio runtime）は searcher.rs のみで使っていたが、indexer でも
必要なため `vector/mod.rs` へ移動し両モジュールから `super::` で参照する。searcher.rs の
該当 private 関数と `OnceLock`/`Connection` import は削除した。

## 改善案

- **1**: 大規模データの再構築が頻発するなら融合バッチ推論を実装し、golden 一致テスト
  （`#[ignore]`、`tests/vector_embeddings.rs` に準じる）で検証して有効化する。
- **2**: ネスト metadata のフィルタが必要になった場合は Struct 再帰スキーマ推論に拡張する。
- **相互運用検証（TASK-20 / M4-T2 で必須）**: Rust 作成 DB を TS が検索、および TS 作成 DB を
  Rust が検索する双方向テストで metadata 型互換性を検証すること。特に TS(`@lancedb/lancedb`) が
  JS 数値を `Float64` で格納する場合、Rust 検索側の `exclude.faqIds`（i64 リテラル）との
  型不一致でフィルタが効かないリスクがある。Rust 作成 DB は整数を `Int64` で格納するため
  Rust 検索側では整合するが、TS 作成 DB 側の実測確認が残課題。

## 優先度

low（1 は性能・2 は特殊ケースで現状影響軽微。相互運用検証は M4-T2 で対応）

## 関連

- タスク: TASK-18 `[M3-T3] index構築`
- 設計: `tmp/dev/plan/design.md` §4（層構造 C-index）、`tmp/dev/plan/development-plan.md` M3-T3
- 関連ファイル: `crates/ygo-search/src/vector/{indexer,embeddings,mod,searcher}.rs`、
  `crates/ygo-search/tests/vector_indexer.rs`
- 後続: TASK-20 `[M4-T2] 統合テスト(TS同等性/embedding/LanceDB)`（双方向相互運用検証）
