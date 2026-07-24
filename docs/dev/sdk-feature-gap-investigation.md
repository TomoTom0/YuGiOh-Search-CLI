# TS/Rust SDK 機能差分調査

> 関連タスク: TASK-3 (調査), TASK-4 (実装タスク起票)
> 作成日: 2026-07-13

## 1. 背景・目的

ygo-search は TypeScript/JS SDK (`src/index.ts` 公開) と Rust ライブラリ (`rust/src/lib.rs`, crate `ygo-search-workers`, `cdylib`+`rlib`) の両方を提供している。しかし SDK としての公開内容に大きな差があり、Rust 側は TS 側のごく一部しか覆盖していない。SDK としての内容に差があるのは不適切であり、本調査はその差を完全に洗い出し、Rust 側に欠けている機能・型・モジュールと移植可能性を特定することを目的とする。

**方針（決定済み）**: インフラ依存機能（Vector 検索・Vector DB 構築等）も含めて、Rust 側に **全実装** する。技術的負債として後回しにはしない。

## 2. 調査対象

- **TS 側エクスポート**: `src/index.ts` の全関数・型（実装は `src/lib/*`, `src/utils/*`, `src/types/*` 配下）
- **Rust 側エクスポート**: `rust/src/lib.rs` 配下の全モジュール（`normalize`, `search`, `faq`, 常時コンパイル ／ `workers`, `workers` feature 时のみ）
- 依存インフラ: `package.json` (TS), `rust/Cargo.toml` (Rust)

### 2.1 パッケージ依存

**TS (`package.json` dependencies)**:
- `@lancedb/lancedb` ^0.23.0 — Vector DB（ローカルファイル）
- `@xenova/transformers` ^2.17.2 — 埋め込みモデル（`Xenova/multilingual-e5-small`、ローカル ONNX 推論）
- `js-yaml` ^4.1.1 — YAML 変換
- `jsonc-parser` ^3.3.1 — JSONC 解析
- `tsx` ^4.20.6 — ランター
- `zod` ^3.25.76 — バリデーション（SDK 公開範囲外の `src/lib/worker/*` で使用）

**Rust (`rust/Cargo.toml`)**:
- `regex` "1" — 常時（normalize/search のワイルドカードで使用）。唯一の常時外部依存
- `worker`/`serde`/`serde_json`/`wasm-bindgen`/`console_error_panic_hook` — `workers` feature 时のみ
- `default = []`（デフォルトは純粋ロジックのみ）

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
- **Rust 側の `CardSearcher`/`FAQSearcher` は純粋関数（メモリ検索）** で D1 に依存しない。D1 アクセスは `workers` feature 配下の `workers/db.rs`・`workers/handlers.rs`（`replace_patterns`/`search_cards`/`search_faqs`）に限定される。
- **Rust 側に Vectorize(d)・LanceDB(e)・transformers(f)・ファイル IO(b) は一切存在しない**。

## 4. 機能覆盖マトリクス

機能カテゴリごとの TS/Rust 公開状況。`○`=公開、`△`=部分対応、`✗`=未実装。

> **注記**: 本表は Rust SDK 実装前（初期調査時）のスナップショットです。PR#56 で M1〜M3
> （型・フォーマット変換・fs・vector 検索・embedding・index 構築など）を実装済みですが、
> 本表の各行はまだ更新されていません。M1〜M5 実装を反映した完了版への包括的更新は
> TASK-21 `[M4-T3] docs整備` で実施予定です。各機能の最新の実装状況は各モジュールの
> `crates/ygo-search/src/{types,format,fs,vector,search,faq}/*.rs` および
> `docs/dev/feature/m*-*.md` を参照してください。

| 機能カテゴリ | TS 公開 API | TS 分類 | Rust 公開 API | Rust 分類 | 差 |
|---|---|---|---|---|---|
| テキスト正規化 | （内部関数、非公開） | (a) | `normalize::normalize_for_search` | (a) | Rust のみ公開。TS は内部利用 |
| パターン抽出 | `extractCardPatterns` / `ExtractOptions` | (a) | `normalize::PatternExtractor::extract` | (a) | 両方あり。`ExtractOptions`(start_index 等) は Rust 未 |
| パターン置換（判定付き） | `judgeAndReplace` / `JudgeAndReplaceOptions` | (a)+(b) | `normalize::PatternReplacer::replace`（純粋置換のみ） | (a) | Rust は置換のみ。抽出+検索+置換の連携 API なし |
| パターン抽出→検索 | `extractAndSearchCards` | (a)+(b) | （なし） | — | Rust 未実装 |
| カード検索 | `searchCards` / `CardSearchParams` | (b) TSV | `search::CardSearcher`（メモリ）+ `workers::search_cards`（D1） | (a)/(c) | 層が違う。TS は TSV 直接読み、Rust はメモリ or D1 |
| FAQ 検索 | `searchFAQ` / `SearchFAQParams` | (b) TSV | `faq::FAQSearcher`（メモリ）+ `workers::search_faqs`（D1） | (a)/(c) | 同上 |
| FAQ カード参照抽出 | `extractCardReferences` | (a) | `faq::FAQSearcher::extract_card_references` | (a) | 両方あり（同等） |
| FAQ 索引読込 | `loadFAQIndex` | (b) TSV | （なし） | — | Rust 未実装（fs 層なし） |
| ID→カード取得 | `getCardsByIds` | (b) TSV | （純粋層なし。`workers::search_card_by_id` は D1） | (c) | Rust 未実装（fs 層）。D1 経由はあり |
| キャッシュクリア | `clearCache` | (a) | （なし） | — | Rust 未実装（キャッシュ機構なし） |
| ランダム/範囲取得 | `seekCards` / `SeekCardsOptions` | (b) TSV | （なし） | — | Rust 未実装 |
| フォーマット変換 | `convertFormatFile`, `detectFormat`, `formatOutput`, `parseFormatString`, `parseFormatFile` / `Format` | (a)+(b) | （なし） | — | Rust 未実装（全部） |
| Vector 検索 | `vectorSearchCards`, `vectorSearchFaqs`, `vectorSearchAll`, `searchTable`, `listTables` | (e)+(f) | （なし） | — | Rust 未実装 |
| Vector DB 構築/変換 | `convertCardsToJsonl`, `convertFaqsToJsonl`, `convertGenericToJsonl`, `indexFromJsonl` | (b)+(e)+(f) | （なし） | — | Rust 未実装 |
| プロジェクトルート検出 | `findProjectRoot` | (b) | （なし） | — | Rust 未実装（必要度低） |
| Workers HTTP API | （`src/lib/worker/*`・SDK 非公開） | (c)/(d) | `workers` feature（5 エンドポイント） | (c) | Rust は Workers API 統合済。TS は SDK 外（別系統） |

### 4.1 Rust 側 Workers HTTP エンドポイント（現状）

`workers` feature 时、`rust/src/workers/mod.rs` で以下を公開:

| エンドポイント | ハンドラ | 依存 |
|---|---|---|
| `POST /api/normalize` | `normalize_text` | (a) のみ（D1 不使用） |
| `POST /api/patterns/extract` | `extract_patterns` | (a) のみ |
| `POST /api/patterns/replace` | `replace_patterns` | (c) D1 |
| `POST /api/search/cards` | `search_cards` | (c) D1 |
| `POST /api/search/faqs` | `search_faqs` | (c) D1 |

D1 テーブル: `cards`, `faqs`, `faq_card_references`（詳細は `rust/src/workers/db.rs`）。

## 5. 型定義の覆盖

### 5.1 TS 公開型（`src/types/card.ts`, `src/types/faq.ts` + 各 lib）

- **カード型**: `Card`, `CardDetail`, `CardMatch`, `ReplacementResult`
- **カード列挙型**: `CardType`, `Attribute`, `LevelType`, `Race`, `MonsterType`, `SpellEffectType`, `TrapEffectType`, `LinkMarker`, `PatternType`, `ExtractedPattern`, `ReplacementStatus`
- **FAQ 型**: `FAQRecord`, `CardReference`, `FAQWithCards`, `FAQSearchResult`, `FAQIndex`
- **パラメータ/オプション型**: `CardSearchParams`, `SearchFAQParams`, `ExtractOptions`, `JudgeAndReplaceOptions`, `SeekCardsOptions`, `Format`
- **Vector 型**: `VectorRecord`, `GenericConversionOptions`, `VectorSearchResult`, `VectorSearchOptions`, `VectorCardSearchOptions`, `VectorFaqSearchOptions`

### 5.2 Rust 公開型（`rust/src/lib.rs` 経由）

- **normalize**: `normalize_for_search`(fn), `ExtractedPattern`, `PatternExtractor`, `PatternType`, `MockCard`, `PatternReplacer`, `ProcessedPattern`, `ReplacementResult`, `ReplacementStatus`
- **search**: `CardSearcher`, `Card`（フィールド: `card_id`, `name`, `normalized_name` のみ — 最小構成）
- **faq**: `FAQSearcher`, `CardReference`, `FAQRecord`（リッチ構造）

### 5.3 型覆盖差（Rust 側に欠けている型）

| 区分 | 欠損型（Rust 側） |
|---|---|
| カード構造 | `CardDetail`, `CardMatch`。`Card` は 3 フィールドのみ（`card_type`/`attribute`/`level`/`atk`/`def`/`description` 等を欠く。これらは `workers/types.rs::CardInfo` にのみ存在し純粋層からは見えない） |
| カード列挙型 | `CardType`, `Attribute`, `LevelType`, `Race`, `MonsterType`, `SpellEffectType`, `TrapEffectType`, `LinkMarker`（全滅） |
| FAQ 構造 | `FAQWithCards`, `FAQSearchResult`, `FAQIndex` |
| パラメータ/オプション | `CardSearchParams`, `SearchFAQParams`, `ExtractOptions`, `JudgeAndReplaceOptions`, `SeekCardsOptions`, `Format` |
| Vector 関連 | `VectorRecord`, `GenericConversionOptions`, `VectorSearchResult`, `VectorSearchOptions`, `VectorCardSearchOptions`, `VectorFaqSearchOptions`（全滅） |

## 6. Rust 側欠損機能・型 一覧（優先度付き）

優先度は「SDK としての API 同等性への寄与」と「利用頻度」で判定。

### P0（高: SDK の中核で、TS ユーザが最も使う）

1. **TSV/ファイル IO 層の新設と、それ経由の検索 API**
   - `searchCards`（`cards-all.tsv` 読込）, `searchFAQ`（`faq-all.tsv`）, `loadFAQIndex`, `getCardsByIds`, `seekCards`（`cards-all.tsv`+`detail-all.tsv`）
   - 現状 Rust は「純粋メモリ検索」or「D1」の 2 層。TS SDK と形状を合わせるには **ファイル IO 層（第3の層）** が必須。
2. **カード型の豊富化**: `Card` を TS の `Card`/`CardDetail` 並みに拡充、列挙型（`CardType`/`Attribute` 等）を新設、`CardMatch` 追加。

### P1（中: SDK ユーティリティ群）

3. **フォーマット変換** (`convertFormatFile`, `detectFormat`, `formatOutput`, `parseFormatString`, `parseFormatFile`, `Format`) — 純粋ロジック(a) + ファイル IO(b)。Rust では `serde_yaml`/`serde_json`/`jsonc` 等で実装可能。
4. **パターン抽出→検索・判定→置換** (`extractAndSearchCards`, `judgeAndReplace`) — P0 の TSV 検索層と純粋パターン処理の連携。
5. **FAQ 索引・キャッシュ** (`loadFAQIndex`, `getCardsByIds` の fs 層, `clearCache`)。

### P2（低: あると便利だが必須でない）

6. **`findProjectRoot`** — Rust でも `std` で容易だが優先度低。

### P3（Vector 系: 設計検討が必要だが全実装する）

7. **Vector 検索** (`vectorSearchCards`, `vectorSearchFaqs`, `vectorSearchAll`, `searchTable`, `listTables`) — LanceDB(e) + 埋め込み(f)。
8. **Vector DB 構築/変換** (`convertCardsToJsonl`, `convertFaqsToJsonl`, `convertGenericToJsonl`, `indexFromJsonl`) — ファイル IO(b) + LanceDB(e) + 埋め込み(f)。

## 7. 移植可能性分類

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

- 現状 5 エンドポイント（normalize/patterns×2/search×2）。TS SDK 公開範囲との直接の対応ではないが、Workers API として `seek`/`format`/`vector` 系エンドポイントを追加する余地あり。ただし Workers 上の Vector は Tier 3 の制約に従う。

## 8. 成果物サマリ

- **機能覆盖マトリクス**: 第4節（16 機能カテゴリ中、Rust が覆盖するのは「正規化・パターン抽出・カード検索・FAQ 検索・参照抽出」のみ。純粋層+Workers/D1 層）
- **Rust 側欠損機能一覧（優先度付き）**: 第6節（P0: TSV IO 層 + カード型豊富化、P1: フォーマット変換 + パターン連携、P2: findProjectRoot、P3: Vector 系一式）
- **移植可能性分類**: 第7節（Tier 1 純粋 / Tier 2 ファイル IO / Tier 3 Vector / Tier 4 Workers 拡張）

## 9. 次段（TASK-4 への入力）

本調査をもとに、`tmp/dev/plan/` 配下に実装設計書・開発計画を作成し、codex レビューを経たのち、TASK-4 で実装タスク群に分割起票する。重点設計項目:

1. TSV/ファイル IO 層の Rust での API 形状（TS の `searchCards(params)` との統一）
2. `Card`/`CardDetail` 型の豊富化方針（`workers/types.rs::CardInfo` との統合・分離）
3. Vector 系クレート選定（`lancedb` + `ort`/`fastembed`）と feature 分離（Vector 機能を default から分離し WASM/Workers と共存）

## 10. 補足（codex レビュー指摘による洗い出し追加）

第4節の覆盖マトリクスについて、codex レビューで以下の機能要素が不足していると指摘された。移植時に個別タスクとして扱う。

### 10.1 追加すべき機能カテゴリ

| 追加カテゴリ | 該当 TS API | 備考 |
|---|---|---|
| TSV 汎用フィルタエンジン | `searchCards`（`filter`/`mode`） | 任意列条件・`and`/`or` グループ化・`includeRuby`・wildcard・text 否定句（`-"..."`）。既存 Rust `CardSearcher` の単純ラップでは足りない |
| 列投影 | `searchCards`（`cols`） | 結果の一部列のみ返却。`Card` DTO の部分投影 |
| Vector where/exclude 生成 | `searchTable`（`where`） | LanceDB の where 式生成。escape/注入リスクあり（設計書第11節） |
| 既存 embedding vector 検索 | `searchTable`（query が `number[]`） | `searchTable` の `query` は `string | number[]`。文字列 query は埋め込み生成、`number[]` は既存ベクトル直接検索 |

### 10.2 `searchAll` の挙動

`vector_search_all` は全テーブルを走査し、**失敗テーブルをスキップ**して継続する。結果は `{ cards, faqs, rules, ... }` のテーブル別 map。Rust 実装でもこの挙動（部分成功）を再現する。

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
