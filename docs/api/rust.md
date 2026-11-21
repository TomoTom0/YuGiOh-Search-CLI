# Rust SDK API リファレンス

Rust 側 2 crate の公開 API を、実コード（`crates/ygo-search/src/`, `crates/ygo-search-workers/src/`）から列挙したリファレンスです（2026-11-21 時点）。

> TS API リファレンスは同階層の typedoc 生成物（[README.md](README.md) から辿る `functions/` / `interfaces/` / `type-aliases/`）を参照してください。TS/Rust の機能対応は `docs/dev/sdk-feature-gap-investigation.md` 第4節にあります。

## crate `ygo-search`（`crates/ygo-search`）

純粋ロジック・型・ファイル IO・Vector 検索を提供する SDK 本体（`rlib`）。

### feature フラグ

| feature | 効果 | 備考 |
|---|---|---|
| （default） | `types` / `normalize` / `search` / `faq` モジュールのみ（純粋ロジック + DTO） | 外部依存は `regex` / `serde` / `serde_json` のみ |
| `format` | `format` モジュールを有効化（JSON/JSONL/JSONC/YAML 変換の純粋部） | native-only（wasm32 では `compile_error!`） |
| `fs` | `fs` モジュールを有効化（TSV 読込・ファイル IO・キャッシュ） | native-only（wasm32 では `compile_error!`） |
| `vector-search` | `vector` モジュールを有効化（LanceDB 検索 + ONNX 埋め込み推論） | native-only（wasm32 では `compile_error!`） |
| `vector-index` | `fs` + `vector-search`（検索 + jsonl 読込 + index 構築の作業束） | native-only |
| `vector` | `vector-index` のエイリアス（全機能） | native-only |

`fs::format_io`（ファイル単位のフォーマット変換）は `fs` と `format` の両 feature が必要です。`fs::convert_generic_to_jsonl` も YAML 入力対応のため `format` を併せて必要とします。

### モジュール: `types`（常時）

TS 公開型の serde DTO 再現。4 サブモジュールから re-export される。

#### `types::card`

列挙型: `CardType`, `Attribute`, `LevelType`, `Race`, `MonsterType`, `SpellEffectType`, `TrapEffectType`, `LinkMarker`, `PatternType`, `ReplacementStatus`

構造体:

- `Card` — カード DTO（TS `Card` 相当、全 21 フィールド）: `card_type: CardType`, `name: String`, `name_modified: String`, `ruby: String`, `card_id: String`, `ciid: Option<String>`, `imgs: Option<String>`（JSON 配列の文字列表現）, `text: Option<String>`, `attribute: Option<Attribute>`, `level_type: Option<LevelType>`, `level_value: Option<String>`, `race: Option<Race>`, `monster_types: Option<String>`（同）, `atk: Option<String>`, `def: Option<String>`, `link_markers: Option<String>`（同）, `pendulum_scale: Option<String>`, `pendulum_text: Option<String>`, `is_extra_deck: Option<String>`, `spell_effect_type: Option<SpellEffectType>`, `trap_effect_type: Option<TrapEffectType>`
- `CardDetail` — `detail-all.tsv` 1 行分: `card_id`, `card_name`, `supplement_info`, `supplement_date`, `pendulum_supplement_info`, `pendulum_supplement_date`（後 4 つは `Option<String>`）
- `ExtractedPattern` — `pattern: String`, `type: PatternType`, `query: String`, `start_index: Option<i64>`, `original_name: Option<String>`
- `CardMatch` — `pattern`, `type`, `query`, `results: Vec<Card>`（`extractAndSearchCards` の要素）
- `ProcessedPattern` — 置換処理した 1 パターンの記録
- `ReplacementResult` — `processed_text`, `has_unprocessed`, `warnings`, `processed_patterns`（`judgeAndReplace` の戻り値）

#### `types::faq`

- `FAQRecord` — FAQ 1 件（質問・回答・カード参照を含む）
- `CardReference` — FAQ 本文中のカード参照
- `FAQWithCards` — カード情報を結合した FAQ
- `FAQSearchResult` — FAQ 検索結果 1 件
- `FAQIndexEntry` — FAQ 索引の 1 エントリ
- `FAQIndex` — FAQ 索引全体

#### `types::options`

- `SearchMode` — 列挙型（`Exact` / `Partial`。部分一致は `name` のみ）
- `Format` — 列挙型（`Json` / `Jsonl` / `Jsonc` / `Yaml`）
- `CardSearchParams` — `filter: serde_json::Value`（任意列条件）, `cols: Option<Vec<String>>`, `mode: Option<SearchMode>`, `include_ruby: Option<bool>`, `flag_auto_modify: Option<bool>`, `flag_allow_wild: Option<bool>`
- `SearchFAQParams` — `faq_id: Option<u32>`, `card_id: Option<u32>`, `card_name: Option<String>`, `card_filter: Option<serde_json::Value>`, `question: Option<String>`, `answer: Option<String>`, `limit: Option<u32>`, `flag_allow_wild: Option<bool>`
- `ExtractOptions` — `include_start_index: Option<bool>`
- `JudgeAndReplaceOptions` — `mount_par: Option<bool>`（`true` で《公式名》形式、既定は `{{name|cardId}}` 形式）
- `SeekCardsOptions` — `max: Option<u32>`, `random: Option<bool>`, `range: Option<[u32; 2]>`, `all: Option<bool>`, `cols: Option<Vec<String>>`, `col_all: Option<bool>`
- `GenericConversionOptions` — `exclude_columns: Option<Vec<String>>`, `include_columns: Option<Vec<String>>`（排他。同時指定はエラー）

#### `types::vector`

- `VectorRecord` — `id: String`, `text: String`, `metadata: serde_json::Value`
- `QueryInput` — 列挙型（`Text(String)` / `Vector(Vec<f32>)`。TS の `string | number[]` に対応）
- `DistanceType` — 列挙型（`L2` / `Cosine`（既定） / `Dot`）
- `FilterValue` — 列挙型（`Str(String)` / `Number(f64)` / `Bool(bool)` / `Range { min: Option<f64>, max: Option<f64> }`）
- `ExcludeOptions` — `ids: Option<Vec<String>>`, `faq_ids: Option<Vec<String>>`, `categories: Option<Vec<String>>`
- `VectorSearchOptions` — `limit: Option<usize>`, `distance_type: Option<DistanceType>`, `threshold: Option<f32>`, `filter: Option<BTreeMap<String, FilterValue>>`, `exclude: Option<ExcludeOptions>`
- `SearchResult` — `id: String`, `text: String`, `metadata: serde_json::Value`, `score: f32`
- `VectorSearchAllResult` — 型エイリアス `BTreeMap<String, Vec<SearchResult>>`（テーブル名 → 結果。0 件のテーブルは含まない）

### モジュール: `normalize`（常時）

純粋ロジック層（外部 IO なし）。DTO 層（`types`）とは別定義の同名型を持つ。

- `normalize_for_search(s: &str) -> String` — 検索用テキスト正規化
- `PatternExtractor` — `new() -> Self`, `extract(&self, text: &str, include_start_index: bool) -> Vec<ExtractedPattern>`
- `PatternReplacer` — `replace(text: &str, patterns: Vec<ExtractedPattern>, search_results: Vec<Vec<MockCard>>, mount_par: bool) -> ReplacementResult`（純粋置換のみ。検索との連携は `fs::judge_and_replace`）
- 型: `PatternType`, `ExtractedPattern`, `ReplacementStatus`, `ProcessedPattern`, `ReplacementResult`, `MockCard`（置換判定用の最小カード表現）

### モジュール: `search`（常時）

- `CardSearcher`（メモリ上の純粋検索）:
  - `search_by_name(cards: &[Card], query: &str) -> Vec<&Card>`
  - `search_by_id(cards: &[Card], card_id: &str) -> Option<&Card>`

### モジュール: `faq`（常時）

- `FAQSearcher`（メモリ上の純粋検索）:
  - `extract_card_references(text: &str) -> Vec<CardReference>`
  - `search_by_text(faqs: &[FAQRecord], query: &str) -> Vec<&FAQRecord>`
  - `search_by_card_id(faqs: &[FAQRecord], card_id: &str) -> Vec<&FAQRecord>`
- `faq::types::{CardReference, FAQRecord}` — 純粋層の FAQ 型（DTO 層 `types::faq` とは別定義）。`FAQRecord::new(faq_id: u32, card_id: &str, question: &str, answer: &str)`, `with_card_references(Vec<CardReference>)`, `with_card_info(Card)`

### モジュール: `format`（feature `format`）

フォーマット変換の純粋部。戻り値の `Value` は `serde_json::Value`。

- `detect_format(filename: &str) -> Format` — 拡張子から形式を判定
- `parse_format_string(content: &str, format: Format) -> Result<Value, FormatError>`
- `format_output(data: &Value, format: Format) -> Result<String, FormatError>`
- `FormatError` — エラー型

### モジュール: `fs`（feature `fs`、native-only）

TSV 読込・ファイル IO・モジュール級キャッシュ。エラー型は `FsError`（`FileNotFound` / `Parse` / `HomeDirUnavailable` / `Io` / `Json` / `Yaml`（`format` 時） / `InvalidOption`）。

#### `fs::search`（TS 互換ラッパ API）

- `search_cards(params: &CardSearchParams) -> Result<Vec<Card>, FsError>` — TS `searchCards`（TSV 読込 → 汎用フィルタエンジン）
- `get_cards_by_ids(ids: &[&str]) -> Result<Vec<Card>, FsError>` — TS `getCardsByIds`（入力順・重複除去・不在 id はスキップ）
- `search_faq(params: &SearchFAQParams) -> Result<Vec<FAQSearchResult>, FsError>` — TS `searchFAQ`
- `load_faq_index() -> Result<FAQIndex, FsError>` — TS `loadFAQIndex`
- `extract_card_references(text: &str) -> Vec<CardReference>` — TS `extractCardReferences`

#### `fs::seek`

- `seek_cards(opts: &SeekCardsOptions) -> Result<Vec<Card>, FsError>` — TS `seekCards`（ランダム/範囲取得）

#### `fs::filter`

- `filter_cards(cards: &[Card], params: &CardSearchParams) -> Vec<Card>` — TSV 汎用フィルタエンジン（TS `card-search-core.ts` の移植。任意列条件・配列値 OR・`{op, cond}` グループ・wildcard・text 列の否定句。`cols` 投影はエンジン内では未適用で TS と同一境界）

#### `fs::pipeline`

- `extract_card_patterns(text: &str, opts: &ExtractOptions) -> Vec<ExtractedPattern>`
- `extract_and_search_cards(text: &str) -> Result<Vec<CardMatch>, FsError>` — TS `extractAndSearchCards`
- `judge_and_replace(text: &str, opts: &JudgeAndReplaceOptions) -> Result<ReplacementResult, FsError>` — TS `judgeAndReplace`

#### `fs::tsv`

- `TsvTable` — `col_index(&self, name: &str) -> Option<usize>`, `cell<'a>(&self, row: &'a [String], name: &str) -> &'a str`
- `read_tsv_table(path: &Path) -> Result<TsvTable, FsError>`
- `read_cards(path: &Path) -> Result<Vec<Card>, FsError>`
- `read_card_details(path: &Path) -> Result<Vec<CardDetail>, FsError>`
- `read_faqs(path: &Path) -> Result<Vec<FAQRecord>, FsError>`
- `load_cards() -> Result<Vec<Card>, FsError>` / `load_card_details() -> Result<Vec<CardDetail>, FsError>` / `load_faqs() -> Result<Vec<FAQRecord>, FsError>` — 標準パスからキャッシュ経由で読込

#### `fs::cache`

- `clear_cache()` — TS `clearCache`（モジュール級キャッシュのクリア）

#### `fs::format_io`（feature `fs` + `format`）

- `parse_format_file(path: &Path, format: Format) -> Result<Value, FormatError>` — TS `parseFormatFile`
- `convert_format_file(input: &Path, output: &Path) -> Result<(), FormatError>` — TS `convertFormatFile`

#### `fs::jsonl`

- `convert_cards_to_jsonl(cards_tsv: &Path, detail_tsv: &Path, output: &Path) -> Result<usize, FsError>` — TS `convertCardsToJsonl`
- `convert_faqs_to_jsonl(tsv_path: &Path, output: &Path) -> Result<usize, FsError>` — TS `convertFaqsToJsonl`
- `convert_generic_to_jsonl(input: &Path, output: &Path, options: &GenericConversionOptions) -> Result<usize, FsError>` — TS `convertGenericToJsonl`（json/yaml/jsonl/tsv/csv 入力。`format` feature が必要）

#### パス解決（`fs` 直下）

- `resolve_workdir(env_val: Option<&str>, home: &Path) -> PathBuf` — workdir 解決の純粋関数（TS `getWorkDir` 互換）
- `find_project_root() -> Result<PathBuf, FsError>` — TS `findProjectRoot`
- `data_dir() -> Result<PathBuf, FsError>`
- `tsv_path(filename: &str) -> Result<PathBuf, FsError>`

### モジュール: `vector`（feature `vector-search`、native-only）

LanceDB（ローカルファイル）+ ONNX 埋め込み推論（`Xenova/multilingual-e5-small`）。エラー型は `VectorError`。

#### `vector::searcher`

- `list_tables() -> Result<Vec<String>, VectorError>` — TS `listTables`
- `search_table(table: &str, query: &QueryInput, opts: &VectorSearchOptions) -> Result<Vec<SearchResult>, VectorError>` — TS `searchTable`（`query` は文字列＝埋め込み生成経由／既存ベクトルの両対応）
- `vector_search_cards(query: &str, opts: &VectorSearchOptions) -> Result<Vec<SearchResult>, VectorError>` — TS `vectorSearchCards`
- `vector_search_faqs(query: &str, opts: &VectorSearchOptions) -> Result<Vec<SearchResult>, VectorError>` — TS `vectorSearchFaqs`
- `vector_search_all(query: &str, opts: &VectorSearchOptions) -> Result<VectorSearchAllResult, VectorError>` — TS `vectorSearchAll`（失敗テーブルはスキップする部分成功）

#### `vector::embeddings`

- `generate_embedding(text: &str) -> Result<Vec<f32>, VectorError>`
- `generate_embeddings(texts: &[&str]) -> Result<Vec<Vec<f32>>, VectorError>`

#### `vector::indexer`

- `parse_jsonl(path: &Path) -> Result<Vec<VectorRecord>, VectorError>`
- `build_record_batch(records: &[VectorRecord], vectors: &[Vec<f32>]) -> Result<RecordBatch, VectorError>`（`RecordBatch` は arrow の型）
- `create_index(table: &str, records: &[VectorRecord]) -> Result<(), VectorError>`
- `index_from_jsonl(table: &str, jsonl_path: &Path) -> Result<(), VectorError>` — TS `indexFromJsonl`

#### `vector::integrity`（モデルファイル整合性検証、TASK-28）

- `ModelManifest` — `parse(text: &str) -> Result<Self, ManifestParseError>`, `get(&self, relpath: &str) -> Option<&str>`, `len(&self) -> usize`, `is_empty(&self) -> bool`, `revision(&self) -> Option<&str>`, `contains(&self, relpath: &str) -> bool`
- `ManifestParseError` — エラー型
- `relpath_under(model_dir: &Path, abs_path: &Path) -> Option<String>`
- `sha256_of_file(path: &Path) -> Result<String, std::io::Error>`
- `verify_file(path: &Path, expected_hex: &str) -> Result<(), VectorError>`
- `verify_model_files(model_dir: &Path, paths: &[&Path], manifest: &ModelManifest) -> Result<(), VectorError>`
- `embedded_manifest() -> &'static ModelManifest`

#### パス解決（`vector` 直下）

- `vector_db_dir() -> Result<PathBuf, VectorError>`
- `model_dir() -> Result<PathBuf, VectorError>`

## crate `ygo-search-workers`（`crates/ygo-search-workers`）

Cloudflare Workers 向け HTTP API（`cdylib` + `rlib`）。`worker` 0.8.7（`d1` feature）に依存し、core crate `ygo-search` は default feature のみを使う。独自の feature フラグはない。

互換のため core の純粋ロジックモジュールを re-export している（`pub use ygo_search::{faq, normalize, search}`。経過措置・将来非推奨）。

### HTTP ルート（`src/lib.rs` の Router）

| メソッド・パス | ハンドラ | 備考 |
|---|---|---|
| `GET /` | （固定応答） | "YGO Search API" を返す |
| `GET /health` | （固定応答） | `{status: "ok", version}` を JSON 応答 |
| `POST /api/normalize` | `handlers::normalize_text` | 純粋ロジックのみ |
| `POST /api/patterns/extract` | `handlers::extract_patterns` | 純粋ロジックのみ |
| `POST /api/patterns/replace` | `handlers::replace_patterns` | D1 使用 |
| `POST /api/search/cards` | `handlers::search_cards` | D1 使用 |
| `POST /api/search/faqs` | `handlers::search_faqs` | D1 使用 |
| `GET /api/cards/seek` | `handlers::seek_cards` | D1 使用（TASK-27） |
| `POST /api/convert` | `handlers::convert` | 純粋ロジックのみ（TASK-27。json/jsonl 相互変換） |

### モジュール: `handlers`

全て `pub async fn (req: Request, ctx: RouteContext<()>) -> Result<Response>`（`worker` crate の型）。上表の 7 関数: `normalize_text`, `extract_patterns`, `replace_patterns`, `search_cards`, `search_faqs`, `seek_cards`, `convert`。

### モジュール: `db`（D1 アクセス）

全て `pub async fn`。戻り値の `Result` は `worker` crate の型。対象テーブルは `cards`, `faqs`, `faq_card_references`。

- `search_cards_by_name(db: &D1Database, query: &str, limit: usize) -> Result<Vec<CardInfo>>`
- `search_card_by_id(db: &D1Database, card_id: &str) -> Result<Option<CardInfo>>`
- `search_faqs_by_text(db: &D1Database, query: &str, limit: usize) -> Result<Vec<FaqInfo>>`
- `search_faqs_by_card_id(db: &D1Database, card_id: &str, limit: usize) -> Result<Vec<FaqInfo>>`
- `seek_cards(db: &D1Database, range: Option<(&str, &str)>, random: bool, all: bool, max: usize) -> Result<Vec<CardInfo>>`

### モジュール: `types`（リクエスト/レスポンス DTO）

- `NormalizeRequest`, `NormalizeResponse`
- `ExtractPatternsRequest`, `ExtractPatternsResponse`, `PatternInfo`
- `ReplacePatternsRequest`, `ReplacePatternsResponse`, `ProcessedPatternInfo`
- `SearchCardsRequest`, `SearchCardsResponse`, `CardInfo`
- `SearchFaqsRequest`, `SearchFaqsResponse`, `FaqInfo`, `CardReferenceInfo`
- `SeekCardsResponse`
- `ConvertResponse`
