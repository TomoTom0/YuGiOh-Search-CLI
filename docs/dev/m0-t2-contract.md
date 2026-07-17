# M0-T2 契約凍結の判断メモ

> TASK-6 (M0-T2): API/TSV contract 固定
> 作成日: 2026-07-14
> 関連: `tmp/dev/plan/design.md` §7-8, `tmp/dev/plan/development-plan.md` M0-T2

M0-T2 で TS 公開 API の型契約と TSV カラム契約を Rust 型 + fixture として固定した。
本ファイルは実装にあたり下した判断・発見したドリフトを記録し、後続タスク（M0-T3 / M1 / M3）への引継ぎとする。

## 成果物

- `crates/ygo-search/src/types/` — `card.rs` / `faq.rs` / `options.rs` / `mod.rs`。TS 公開型面の serde DTO。
- `crates/ygo-search/tests/fixtures/` — `tsv-contract.json`（カラム契約）+ カード/FAQ/パターン代表例。
- `crates/ygo-search/tests/contract.rs` — 往復テスト・enum 値検証・カラム契約検証（22 件）。

## 判断事項

### 1. `SpellEffectType` は `quick` を採用（M0-T3 で最終確定）

- `docs/usage/schema.md` と `src/types/card.ts` は `'quick'`。`src/lib/vector/converter.ts` のみ `'quickPlay'` で TS 内部不一致。
- 本契約は権威である `schema.md` に合わせ `quick` とした。Rust variant 名は `QuickPlay`（语义保持）だが `#[serde(rename = "quick")]` で `quick` に直列化。
- **M0-T3 (TASK-7) で解決済**: `converter.ts` の `quickPlay` → `quick` に統一した（潜在バグ: 速攻魔法の「速攻」欠落も解消）。詳細は `docs/dev/m0-t3-searchcards-filter-spec.md` §1。

### 2. `cardId` の string / number 不一致を忠実に再現

- `Card.cardId` は TS で `string`、一方 FAQ 系（`CardReference.cardId`, `FAQRecord.faqId`, `allCardIds`）は `number`。
- これをそのまま再現: `Card.card_id: String`, `CardReference.card_id: u32`, `FAQRecord.faq_id: u32`。
- これは TS 側の既存仕様（TSV の `cardId`/`faqId` は文字列だが FAQ 系 API は数値化して返す）に由来。Rust 側で**矯正せず**現状を固定。

### 3. enum 別の serde rename 戦略

| enum | rename | 備考 |
|---|---|---|
| CardType / Attribute / LevelType / MonsterType / TrapEffectType | `lowercase` | |
| Race | `lowercase` | 多語種は連結小文字（`BeastWarrior`→`beastwarrior`）。`lowercase` で一致 |
| SpellEffectType | `lowercase` + `QuickPlay` 個別 `rename="quick"` | |
| PatternType | `lowercase` + `CardId` 個別 `rename="cardId"` | camelCase 値のため個別 rename |
| ReplacementStatus | `lowercase` + `AlreadyProcessed` 個別 `rename="already_processed"` | |
| LinkMarker | `kebab-case` | `TopLeft`→`top-left` |
| SearchMode / Format | `lowercase` | |

予約語 `type` フィールド（`ExtractedPattern`, `CardMatch`）は `r#type` で定義。serde は `type` キーとして直列化（テスト `extract_pattern_uses_reserved_type_key` で検証）。

### 4. M1 / M3 とのスコープ境界（明示）

- **本タスク（M0-T2）**: 型定義のコンパイル + serde 往復 + fixture。実ロジックへの結線なし。
- **M1-T1/T2 (TASK-8/9)**: 既存 `search::Card`(3フィールド) と内部 `faq::types::FAQRecord` を本 DTO に統合し、`CardSearcher` 等を実ロジックへ接続。
- **M3**: vector 系型（`VectorRecord`, `SearchResult`, `VectorSearchOptions`, `CardSearchOptions`, `FaqSearchOptions`, `GenericConversionOptions`）は本契約の対象外。`src/lib/vector/*` を基に M3-T1 で別途定義。

### 5. fixture の位置と方針

- 設計書は `tests/fixtures/`（最上位）と記載していたが、workspace 分離後は `crates/ygo-search/tests/fixtures/` に同居（最上位 `tests/` は TS 専用のため）。言語非依存 JSON なので将来 TS 側 golden test からも参照可能。
- 実データ TSV（`~/.local/ygo-search/data/tsv/`）が手元に無いため、fixture は実行時キャプチャではなく**型契約を網羅する手作り代表例**。M4 で実データによる golden test に拡張予定。

## 発見したドリフト（参考）

- TS `tests/fixtures/mock-data.ts` は `schema.md` と不一致（`attribute:'光'` / `race:'ドラゴン族'` 等の日本語値、配列形式の `monsterTypes`、`nameModified` 欠落）。これは TS 側の古い fixture であり、本 Rust 契約は `schema.md`（権威）に準拠した。TS 側 fixture の整備は別課題。

## 検証結果

- `cargo build -p ygo-search`: 成功（serde / serde_json 常時依存化）
- `cargo test -p ygo-search`: unit 48 + contract 22 = 70 件全通過
