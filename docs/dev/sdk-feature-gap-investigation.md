# TS/Rust SDK 機能差分調査

> 関連タスク: TASK-3 (調査), TASK-4 (実装タスク起票), TASK-21 (完了版更新)
> 作成日: 2026-07-13
> 完了版更新: 2026-11-21 (TASK-21 `[M4-T3] docs整備`) — M1〜M5 実装を反映し、第2・4・5・6節を現行コードと突き合わせた完了版

## 1. 背景・目的

ygo-search は TypeScript/JS SDK (`src/index.ts` 公開) と Rust ライブラリ (当初 `rust/src/lib.rs`, crate `ygo-search-workers`) の両方を提供している。しかし SDK としての公開内容に大きな差があり、Rust 側は TS 側のごく一部しか覆盖していない。SDK としての内容に差があるのは不適切であり、本調査はその差を完全に洗い出し、Rust 側に欠けている機能・型・モジュールと移植可能性を特定することを目的とする。

**方針（決定済み）**: インフラ依存機能（Vector 検索・Vector DB 構築等）も含めて、Rust 側に **全実装** する。技術的負債として後回しにはしない。

> **完了版注記 (2026-11-21)**: 上記の差は M0〜M5 の実装で解消された。Rust 側は 2 crate 構成 (純粋ロジック + SDK 本体の `ygo-search` と、Cloudflare Workers 向け `ygo-search-workers`) となり、本書の第4節・第6節は全項目が「解消済み」または形状差の注記に更新されている。残件として読むべきものは第6節末尾の「残件」に集約した。

## 2. 調査対象

- **TS 側エクスポート**: `src/index.ts` の全関数・型（実装は `src/lib/*`, `src/utils/*`, `src/types/*`, `src/search-faq.ts` 配下）
- **Rust 側エクスポート**: 2 crate の公開 API
  - `crates/ygo-search` (crate `ygo-search`, `rlib`): `src/lib.rs` 配下の全モジュール（`types`, `normalize`, `search`, `faq` は常時コンパイル ／ `format`, `fs`, `vector` は feature 有効時のみ）
  - `crates/ygo-search-workers` (crate `ygo-search-workers`, `cdylib`+`rlib`): `src/lib.rs` 配下の全モジュール（`db`, `handlers`, `types`）。core crate (`ygo-search`, default feature のみ) に依存
- 依存インフラ: `package.json` (TS), `crates/ygo-search/Cargo.toml` / `crates/ygo-search-workers/Cargo.toml` (Rust)

### 2.1 パッケージ依存

**TS (`package.json` dependencies)**:
- `@lancedb/lancedb` ^0.31.0 — Vector DB（ローカルファイル）
- `@xenova/transformers` ^2.17.2 — 埋め込みモデル（`Xenova/multilingual-e5-small`、ローカル ONNX 推論）
- `js-yaml` ^4.1.1 — YAML 変換
- `jsonc-parser` ^3.3.1 — JSONC 解析
- `tsx` ^4.20.6 — ランター
- `zod` ^3.25.76 — バリデーション（SDK 公開範囲外の `src/lib/worker/*` で使用）
- `commander` ^15.0.0 — CLI

**Rust core (`crates/ygo-search/Cargo.toml`)**:
- 常時: `regex` "1"（normalize/search のワイルドカードで使用）、`serde` "1" / `serde_json` "1"（DTO 定義・型契約用）
- `format` feature: `serde_yaml` "0.9"、`jsonc-parser` "0.26"、`chrono` "0.4"、`thiserror` "1"
- `fs` feature: `csv` "1"、`dirs` "5"、`rand` "0.8"、`thiserror` "1"
- `vector-search` / `vector-index` feature: `lancedb` "0.31"、`arrow-array`/`arrow-schema`/`arrow-json` "58"、`datafusion-expr`/`datafusion-functions` "53"、`ort` "=2.0.0-rc.12"、`tokenizers` "0.21"、`tokio` "1"、`ndarray` "0.17"、`futures` "0.3"、`sha2` "0.10"（モデル整合性検証）
- `default = []`（デフォルトは純粋ロジック + 型のみ）

**Rust workers (`crates/ygo-search-workers/Cargo.toml`)**:
- `worker` "0.8.7"（`d1` feature 有効）、`serde` "1"、`serde_json` "1"、`wasm-bindgen` "0.2"、`console_error_panic_hook` "0.1"、`ygo-search`（path 依存・default feature のみ）

## 3. 前提: 依存インフラ分類カテゴリ

各機能を以下のカテゴリで分類する（複数該当あり）。

| カテゴリ | 意味 |
|---|---|
| (a) | 純粋ロジック（外部 IO なし・std/regex のみでどこでも動く） |
| (b) | ローカルファイル IO（`node:fs` / `std::fs`） |
| (c) | Cloudflare D1（`worker` crate 経由） |
| (d) | Cloudflare Vectorize |
| (e) | LanceDB（ローカルファイル Vector DB） |
| (f) | transformers.js / ONNX（ローカル埋め込み推論） |

### 3.1 重要な前提事実

- **TS SDK 公開範囲（`src/index.ts`）は D1/Vectorize/Workers AI に依存しない**。これらは `src/lib/worker/*`（Cloudflare Worker 実装、SDK 非公開）でのみ使用される。
- **TS 側 Vector 機能の実体は LanceDB（ローカルファイル）+ transformers.js（ローカル ONNX）**。Node.js 前提（LanceDB ネイティブバインディング + モデルダウンロード）。ブラウザ/Worker 上では直接動かない。
- **Rust 側の `CardSearcher`/`FAQSearcher` は純粋関数（メモリ検索）** で D1 に依存しない。D1 アクセスは workers crate の `crates/ygo-search-workers/src/db.rs`・`handlers.rs`（`search_cards`/`search_faqs`/`seek_cards` 等）に限定される。
- **Rust 側のファイル IO・LanceDB・ONNX は core crate に実装済み**（当初調査時は一切存在しなかった）。ファイル IO は `fs` feature、LanceDB(e) + ONNX(f) は `vector-search` / `vector-index` feature（いずれも native-only で、wasm32 では `compile_error!`）。workers crate のコードは D1 のみを使用し、Vectorize(d)・Workers AI は `wrangler.toml` にバインディング宣言があるのみで未使用。

## 4. 機能覆盖マトリクス

機能カテゴリごとの TS/Rust 公開状況。`○`=公開、`△`=部分対応、`✗`=未実装。

> **注記 (完了版, 2026-11-21)**: 本表は M1〜M5 実装（PR #56〜#61）を反映した完了版です。当初調査時（2026-07-13、実装前スナップショット）からの状態変化は各行の「差」列に記録しています。根拠は現行コード `crates/ygo-search/src/{types,format,fs,vector,search,faq,normalize}/*.rs` および `crates/ygo-search-workers/src/*.rs` です。Rust API の全体像は `docs/api/rust.md` を参照してください。

| 機能カテゴリ | TS 公開 API | TS 分類 | Rust 公開 API | Rust 分類 | 差 |
|---|---|---|---|---|---|
| テキスト正規化 | （内部関数、非公開） | (a) | `normalize::normalize_for_search` | (a) | Rust のみ公開。TS は内部利用（当初から不変） |
| パターン抽出 | `extractCardPatterns` / `ExtractOptions` | (a) | `normalize::PatternExtractor::extract` + `types::ExtractOptions` + `fs::extract_card_patterns` | (a) | 解消。当初「`ExtractOptions` は Rust 未」だったが、型・抽出本体とも実装済み |
| パターン置換（判定付き） | `judgeAndReplace` / `JudgeAndReplaceOptions` | (a)+(b) | `normalize::PatternReplacer::replace`（純粋置換）+ `fs::judge_and_replace`（抽出+検索+置換の連携） | (a)/(a)+(b) | 解消。当初は純粋置換のみで連携 API がなかった |
| パターン抽出→検索 | `extractAndSearchCards` | (a)+(b) | `fs::extract_and_search_cards` | (a)+(b) | 解消（当初は未実装） |
| カード検索 | `searchCards` / `CardSearchParams` | (b) TSV | `search::CardSearcher`（メモリ）+ `fs::search_cards`（TSV + 汎用フィルタエンジン）+ workers `POST /api/search/cards`（D1） | (a)/(b)/(c) | 解消。fs 層の新設で TS と同じ TSV 直読みの形状が揃った |
| FAQ 検索 | `searchFAQ` / `SearchFAQParams` | (b) TSV | `faq::FAQSearcher`（メモリ）+ `fs::search_faq`（TSV）+ workers `POST /api/search/faqs`（D1） | (a)/(b)/(c) | 解消（同上） |
| FAQ カード参照抽出 | `extractCardReferences` | (a) | `faq::FAQSearcher::extract_card_references` + `fs::extract_card_references` | (a) | 両方あり（同等。当初から不変） |
| FAQ 索引読込 | `loadFAQIndex` | (b) TSV | `fs::load_faq_index` | (b) | 解消（当初は fs 層なしで未実装） |
| ID→カード取得 | `getCardsByIds` | (b) TSV | `fs::get_cards_by_ids`（純粋層）+ workers `db::search_card_by_id`（D1） | (b)/(c) | 解消（当初は D1 経由のみ） |
| キャッシュクリア | `clearCache` | (a) | `fs::clear_cache` | (a) | 解消（当初はキャッシュ機構なし） |
| ランダム/範囲取得 | `seekCards` / `SeekCardsOptions` | (b) TSV | `fs::seek_cards` + workers `GET /api/cards/seek`（D1） | (b)/(c) | 解消（当初は未実装） |
| フォーマット変換 | `convertFormatFile`, `detectFormat`, `formatOutput`, `parseFormatString`, `parseFormatFile` / `Format` | (a)+(b) | `format::{detect_format, parse_format_string, format_output}`（純粋部）+ `fs::{parse_format_file, convert_format_file}`（ファイル IO） | (a)/(b) | 解消（当初は全部未実装）。純粋部は `format` feature、ファイル IO は `fs`+`format` feature |
| Vector 検索 | `vectorSearchCards`, `vectorSearchFaqs`, `vectorSearchAll`, `searchTable`, `listTables` | (e)+(f) | `vector::{vector_search_cards, vector_search_faqs, vector_search_all, search_table, list_tables}` | (e)+(f) | 解消（当初は未実装）。`vector-search` feature |
| Vector DB 構築/変換 | `convertCardsToJsonl`, `convertFaqsToJsonl`, `convertGenericToJsonl`, `indexFromJsonl` | (b)+(e)+(f) | `fs::{convert_cards_to_jsonl, convert_faqs_to_jsonl, convert_generic_to_jsonl}` + `vector::{create_index, index_from_jsonl}` | (b)/(e) | 解消（当初は未実装）。変換は `fs` feature（generic は `format` も必要）、index 構築は `vector-index` feature |
| プロジェクトルート検出 | `findProjectRoot` | (b) | `fs::find_project_root` | (b) | 解消（当初は未実装） |
| Workers HTTP API | （`src/lib/worker/*`・SDK 非公開） | (c)/(d) | workers crate（独立 crate・worker 0.8.7、7 API エンドポイント。第4.1節） | (c) | Rust は Workers API 統合済。当初は `workers` feature・5 エンドポイントだったが、独立 crate 化し seek/convert を追加 |

### 4.1 Rust 側 Workers HTTP エンドポイント（現状）

workers crate `crates/ygo-search-workers/src/lib.rs` の Router に登録された全ルート:

| エンドポイント | ハンドラ | 依存 |
|---|---|---|
| `GET /` | （固定応答 "YGO Search API"） | なし |
| `GET /health` | （`{status, version}` を JSON 応答） | なし |
| `POST /api/normalize` | `normalize_text` | (a) のみ（D1 不使用） |
| `POST /api/patterns/extract` | `extract_patterns` | (a) のみ |
| `POST /api/patterns/replace` | `replace_patterns` | (c) D1 |
| `POST /api/search/cards` | `search_cards` | (c) D1 |
| `POST /api/search/faqs` | `search_faqs` | (c) D1 |
| `GET /api/cards/seek` | `seek_cards` | (c) D1（TASK-27 で追加。TS `seek-cards.ts` 準拠。`cols`/`colAll` は CardInfo 固定スキーマのため無視） |
| `POST /api/convert` | `convert` | (a) のみ（TASK-27 で追加。TS `convert.ts` 準拠の json/jsonl 相互変換。core format feature は wasm32 で使えないため workers 側に純粋関数として実装） |

D1 テーブル: `cards`, `faqs`, `faq_card_references`（詳細は `crates/ygo-search-workers/src/db.rs`）。

workers crate は互換のため core の純粋ロジックモジュール（`ygo_search::{faq, normalize, search}`）を re-export している（経過措置・将来非推奨。新規利用者は `ygo-search` crate を直接使うこと）。

## 5. 型定義の覆盖

### 5.1 TS 公開型（`src/types/card.ts`, `src/types/faq.ts` + 各 lib）

- **カード型**: `Card`, `CardDetail`, `CardMatch`, `ReplacementResult`
- **カード列挙型**: `CardType`, `Attribute`, `LevelType`, `Race`, `MonsterType`, `SpellEffectType`, `TrapEffectType`, `LinkMarker`, `PatternType`, `ExtractedPattern`, `ReplacementStatus`
- **FAQ 型**: `FAQRecord`, `CardReference`, `FAQWithCards`, `FAQSearchResult`, `FAQIndex`
- **パラメータ/オプション型**: `CardSearchParams`, `SearchFAQParams`, `ExtractOptions`, `JudgeAndReplaceOptions`, `SeekCardsOptions`, `Format`
- **Vector 型**: `VectorRecord`, `GenericConversionOptions`, `VectorSearchResult`, `VectorSearchOptions`, `VectorCardSearchOptions`, `VectorFaqSearchOptions`

### 5.2 Rust 公開型（現行・2 crate）

**core crate `ygo-search` — `types` モジュール（DTO 層、常時）**:
- `types::card`: `CardType`, `Attribute`, `LevelType`, `Race`, `MonsterType`, `SpellEffectType`, `TrapEffectType`, `LinkMarker`, `PatternType`, `Card`（TS `Card` 相当の全フィールド DTO）, `CardDetail`, `ExtractedPattern`, `CardMatch`, `ReplacementStatus`, `ProcessedPattern`, `ReplacementResult`
- `types::faq`: `FAQRecord`, `CardReference`, `FAQWithCards`, `FAQSearchResult`, `FAQIndexEntry`, `FAQIndex`
- `types::options`: `SearchMode`, `Format`, `CardSearchParams`, `SearchFAQParams`, `ExtractOptions`, `JudgeAndReplaceOptions`, `SeekCardsOptions`, `GenericConversionOptions`
- `types::vector`: `VectorRecord`, `QueryInput`, `DistanceType`, `FilterValue`, `ExcludeOptions`, `VectorSearchOptions`, `SearchResult`, `VectorSearchAllResult`

**core crate `ygo-search` — 純粋ロジック層（常時）**:
- `normalize`: `normalize_for_search`(fn), `PatternType`, `ExtractedPattern`, `PatternExtractor`, `ReplacementStatus`, `ProcessedPattern`, `ReplacementResult`, `MockCard`, `PatternReplacer`
- `search`: `CardSearcher`
- `faq`: `FAQSearcher`, `faq::types::{CardReference, FAQRecord}`

**workers crate `ygo-search-workers` — `types` モジュール**:
- `NormalizeRequest`, `NormalizeResponse`, `ExtractPatternsRequest`, `ExtractPatternsResponse`, `PatternInfo`, `ReplacePatternsRequest`, `ReplacePatternsResponse`, `ProcessedPatternInfo`, `SearchCardsRequest`, `SearchCardsResponse`, `CardInfo`, `SearchFaqsRequest`, `SearchFaqsResponse`, `FaqInfo`, `CardReferenceInfo`, `SeekCardsResponse`, `ConvertResponse`

### 5.3 型覆盖差（現行）

当初調査で挙げた欠損型は全て解消した（`CardDetail`, `CardMatch`、カード列挙型全種、`FAQWithCards`, `FAQSearchResult`, `FAQIndex`、各パラメータ/オプション型、Vector 関連型）。`search::CardSearcher` が使っていた最小構成の `Card`（3 フィールド）も、現行では `types::Card`（全フィールド DTO）に置き換わっている。

残る差は欠損ではなく形状差である:

| 区分 | 形状差の内容 |
|---|---|
| Vector オプション型 | TS の `VectorCardSearchOptions` / `VectorFaqSearchOptions`（テーブル別型）に相当する個別の型は Rust にはなく、`vector_search_cards` / `vector_search_faqs` とも共通の `VectorSearchOptions` を使う |
| 同名型の併存 | 純粋ロジック層（`normalize::*`, `faq::types::*`）と DTO 層（`types::*`）に同名の型（`ExtractedPattern`, `PatternType`, `ReplacementResult`, `ReplacementStatus`, `ProcessedPattern`, `FAQRecord`, `CardReference`）が併存する。DTO 層は TS 型契約の再現、純粋層は当初からの実装で、両方とも公開 API である |

## 6. Rust 側欠損機能・型 一覧（優先度付き）

優先度は「SDK としての API 同等性への寄与」と「利用頻度」で判定。各項目の状態は 2026-11-21 の完了版更新で現行コードと突き合わせて付けた。

### P0（高: SDK の中核で、TS ユーザが最も使う）

1. **TSV/ファイル IO 層の新設と、それ経由の検索 API** —
- `searchCards`（`cards-all.tsv` 読込）, `searchFAQ`（`faq-all.tsv`）, `loadFAQIndex`, `getCardsByIds`, `seekCards`（`cards-all.tsv`+`detail-all.tsv`）
- 現状 Rust は「純粋メモリ検索」or「D1」の 2 層。TS SDK と形状を合わせるには **ファイル IO 層（第3の層）** が必須。
- → `fs` feature として実装済み（`fs::search_cards`, `fs::search_faq`, `fs::load_faq_index`, `fs::get_cards_by_ids`, `fs::seek_cards`。M2-T2/T3）。
2. **カード型の豊富化**: `Card` を TS の `Card`/`CardDetail` 並みに拡充、列挙型（`CardType`/`Attribute` 等）を新設、`CardMatch` 追加。 —
- → `types::card` に全フィールド DTO と列挙型全種・`CardMatch` を実装済み（M0-T2/M1）。

### P1（中: SDK ユーティリティ群）

3. **フォーマット変換** (`convertFormatFile`, `detectFormat`, `formatOutput`, `parseFormatString`, `parseFormatFile`, `Format`) — 純粋ロジック(a) + ファイル IO(b)。Rust では `serde_yaml`/`serde_json`/`jsonc` 等で実装可能。 —
- → 純粋部は `format` feature（`format::detect_format` 等）、ファイル IO は `fs` feature（`fs::parse_format_file`, `fs::convert_format_file`）に実装済み（M1）。
4. **パターン抽出→検索・判定→置換** (`extractAndSearchCards`, `judgeAndReplace`) — P0 の TSV 検索層と純粋パターン処理の連携。 —
- → `fs::extract_and_search_cards`, `fs::judge_and_replace` として実装済み。
5. **FAQ 索引・キャッシュ** (`loadFAQIndex`, `getCardsByIds` の fs 層, `clearCache`)。 —
- → `fs::load_faq_index`, `fs::get_cards_by_ids`, `fs::clear_cache` として実装済み。

### P2（低: あると便利だが必須でない）

6. **`findProjectRoot`** — Rust でも `std` で容易だが優先度低。 —
- → `fs::find_project_root` として実装済み。

### P3（Vector 系: 設計検討が必要だが全実装する）

7. **Vector 検索** (`vectorSearchCards`, `vectorSearchFaqs`, `vectorSearchAll`, `searchTable`, `listTables`) — LanceDB(e) + 埋め込み(f)。 —
- → `vector-search` feature（`vector::vector_search_cards` 等）として実装済み（M3）。埋め込みは `ort` + `tokenizers` による `Xenova/multilingual-e5-small` のローカル推論。
8. **Vector DB 構築/変換** (`convertCardsToJsonl`, `convertFaqsToJsonl`, `convertGenericToJsonl`, `indexFromJsonl`) — ファイル IO(b) + LanceDB(e) + 埋め込み(f)。 —
- → 変換は `fs::convert_cards_to_jsonl` 等、index 構築は `vector-index` feature（`vector::create_index`, `vector::index_from_jsonl`）として実装済み（M3-T3）。

### 残件（欠損として残っているもの）

機能・型の欠損は解消した。残件として読むべきものは次の形状差・範囲外事項のみである:

- **Vector テーブル別 Options 型の形状差**（第5.3節）: TS の `VectorCardSearchOptions` / `VectorFaqSearchOptions` に相当する個別型はなく、共通の `VectorSearchOptions` で代替している。機能欠損ではない。
- **Workers 上の Vector**: Rust workers crate は Vectorize / Workers AI を使用していない（`wrangler.toml` のバインディング宣言のみ）。これは当初から SDK 公開範囲外として優先度を下げた事項であり（第7節 Tier 3 の制約）、欠損には数えない。

## 7. 移植可能性分類

> 完了版注記: 以下は当初調査時の分類であり、Tier 1〜4 とも計画どおり実施済み（現行の実装配置は第4節・第6節を参照）。クレート選定は `lancedb` + `ort`/`tokenizers`（`fastembed` は不採用）で確定した。

### Tier 1: 純粋ロジック（std/regex/serde のみ、即移植可能）

- フォーマット変換の純粋部: `detectFormat`, `formatOutput`, `parseFormatString` → `serde_yaml`/`serde_json`/JSONC パーサで実装
- 型定義群: `Card` 豊富化、`CardDetail`/`CardMatch`/列挙型群/`FAQWithCards`/`FAQSearchResult`/`FAQIndex`/各 `Options` 型
- `extractCardReferences` ↔ 既存 `FAQSearcher::extract_card_references`（ほぼ同等）

### Tier 2: ファイル IO 層（`std::fs`、Rust に新設）

- TSV 読込層: `searchCards`, `searchFAQ`, `loadFAQIndex`, `getCardsByIds`, `seekCards`（`cards-all.tsv`/`detail-all.tsv`/`faq-all.tsv`）
- JSONL 変換: `convertCardsToJsonl`, `convertFaqsToJsonl`, `convertGenericToJsonl`
- フォーマット IO: `convertFormatFile`, `parseFormatFile`
- `findProjectRoot`
- `extractAndSearchCards`, `judgeAndReplace`（Tier 1 + TSV 検索の連携）
- **設計判断**: Rust に TSV IO 層を新設するか、または `Card`/`FAQRecord` のビルダ経由でメモリに読ませる API にするか。TS との API 形状統一を優先する場合は TSV 直読み関数を置く。

### Tier 3: Vector 系（設計検討 + 全実装）

- **Vector 検索/DB 構築** を Rust で実現するためのクレート選定（設計書 `tmp/dev/plan/` で詳細化）:
- Vector DB: `lancedb` (crates.io) — TS の `@lancedb/lancedb` と同じエンジンの Rust 版
- 埋め込み: `ort`（ONNX Runtime）+ `tokenizers` で `Xenova/multilingual-e5-small` を実行、または `fastembed`（`multilingual-e5-small` サポートのラッパークレート）
- DB パス: TS は `<workDir>/data/vector/`。Rust も同等
- **制約**: LanceDB/ONNX は WASM では動かないため、`workers` feature（Cloudflare Workers 向け cdylib）では Vector 系を提供できない。Workers で Vector を扱う場合は Vectorize + Workers AI が必要（TS の `src/lib/worker/*` 構成と同等）だが、これは SDK 公開範囲外のため優先度を下げる。

### Tier 4: Workers API 拡張（既存 `workers` feature）

- 当初 5 エンドポイント（normalize/patterns×2/search×2）だったが、独立 crate 化のうえ seek/convert を追加し現行 7 API エンドポイント（第4.1節）。TS SDK 公開範囲との直接の対応ではないが、Workers API として `vector` 系エンドポイントを追加する余地は Tier 3 の制約により残っていない（Workers 上の Vector は SDK 範囲外）。

## 8. 成果物サマリ

- **機能覆盖マトリクス**: 第4節（17 機能カテゴリ全てで Rust 側の対応が揃った。当初は「正規化・パターン抽出・カード検索・FAQ 検索・参照抽出」の 5 カテゴリのみだった）
- **Rust 側欠損機能一覧（優先度付き）**: 第6節（P0〜P3 の全 8 項目が解消済み。残件は形状差・範囲外事項のみ）
- **移植可能性分類**: 第7節（Tier 1 純粋 / Tier 2 ファイル IO / Tier 3 Vector / Tier 4 Workers 拡張。当初調査時の分類で、全 Tier 実施済み）

## 9. 次段（TASK-4 への入力）

本調査をもとに、`tmp/dev/plan/` 配下に実装設計書・開発計画を作成し、codex レビューを経たのち、TASK-4 で実装タスク群に分割起票する。重点設計項目:

1. TSV/ファイル IO 層の Rust での API 形状（TS の `searchCards(params)` との統一）
2. `Card`/`CardDetail` 型の豊富化方針（`workers/types.rs::CardInfo` との統合・分離）
3. Vector 系クレート選定（`lancedb` + `ort`/`fastembed`）と feature 分離（Vector 機能を default から分離し WASM/Workers と共存）

> 完了版注記: 上記は実施済み。設計 v2（第10.4節）に基づき M0〜M5 のマイルストーンで実装され、PR #56〜#61 で dev にマージされた。

## 10. 補足（codex レビュー指摘による洗い出し追加）

第4節の覆盖マトリクスについて、codex レビューで以下の機能要素が不足していると指摘された。移植時に個別タスクとして扱う。

### 10.1 追加すべき機能カテゴリ

| 追加カテゴリ | 該当 TS API | 備考 |
|---|---|---|
| TSV 汎用フィルタエンジン | `searchCards`（`filter`/`mode`） | 任意列条件・`and`/`or` グループ化・`includeRuby`・wildcard・text 否定句（`-"..."`）。既存 Rust `CardSearcher` の単純ラップでは足りない |
| 列投影 | `searchCards`（`cols`） | 結果の一部列のみ返却。`Card` DTO の部分投影 |
| Vector where/exclude 生成 | `searchTable`（`where`） | LanceDB の where 式生成。escape/注入リスクあり（設計書第11節） |
| 既存 embedding vector 検索 | `searchTable`（query が `number[]`） | `searchTable` の `query` は `string | number[]`。文字列 query は埋め込み生成、`number[]` は既存ベクトル直接検索 |

> 完了版注記 (2026-11-21): 上記 4 件の実装状況は次のとおり。
> - TSV 汎用フィルタエンジン: 実装済み（`fs::filter_cards`、M2-T2。TS `card-search-core.ts` の忠実移植で、任意列条件・配列値による OR・`{op, cond}` 形式のグループ化・`includeRuby`・wildcard・text 列の否定句に対応）
> - 列投影: `filter` エンジン内では未適用だが、これは TS core と同一の境界である（M0-T3 仕様 §6 で、投影は呼び出し側パイプラインの担当と確定）。欠損ではない
> - Vector where/exclude 生成: 実装済み（`VectorSearchOptions.filter`（`FilterValue`）による where 生成と `exclude`（`ExcludeOptions`））
> - 既存 embedding vector 検索: 実装済み（`search_table` の `query: &QueryInput` が `Text` / `Vector` の両形式を受ける）

### 10.2 `searchAll` の挙動

`vector_search_all` は全テーブルを走査し、**失敗テーブルをスキップ**して継続する。結果は `{ cards, faqs, rules,...}` のテーブル別 map。Rust 実装でもこの挙動（部分成功）を再現する。

> 完了版注記: 実装済み（`vector::vector_search_all`。失敗テーブルをスキップし、テーブル名 → 結果の `VectorSearchAllResult` を返す）。

### 10.3 TS 内部の仕様不一致（M0-T3 で解決済）

`SpellEffectType` は TS 内で不一致だったが、**M0-T3 (TASK-7) で `quick` に統一し解決**（`docs/dev/m0-t3-searchcards-filter-spec.md` §1）:
- `src/types/card.ts`: `'normal' | 'quick' | 'continuous' | 'equip' | 'field' | 'ritual'`
- `src/lib/vector/converter.ts`: 旧 `quickPlay` → `quick` に修正（潜在バグ: 速攻魔法の「速攻」欠落も解消）。テスト `tests/unit/vector-converter.test.ts` で固定。

正は `quick`（権威 `docs/usage/schema.md` に一致）。Rust 側 enum も `#[serde(rename = "quick")]` で同値に直列化済（M0-T2）。

### 10.4 改訂後の成果物参照

詳細な実装設計・マイルストーン・タスク分割は、codex レビューを反映した改訂版を参照:
- 実装設計書 v2: `tmp/dev/plan/design.md`
- 開発計画 v2: `tmp/dev/plan/development-plan.md`
- codex レビューサマリ: `tmp/dev/plan/codex-review-summary.md`
