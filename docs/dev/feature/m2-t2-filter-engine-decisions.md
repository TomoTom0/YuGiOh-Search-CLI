# M2-T2 汎用フィルタエンジンの設計判断

## 現状

`crates/ygo-search/src/fs/{filter,search}.rs` に TS `card-search-core.ts` /
`search-faq.ts` / `faq-loader.ts` の忠実な移植を実装した（TASK-12 / M2-T2）。
公開 API: `search_cards` / `search_faq` / `load_faq_index` / `get_cards_by_ids` /
`extract_card_references`。

移植にあたり、TS 実装と M0-T3 仕様メモ（`docs/dev/m0-t3-searchcards-filter-spec.md`）
の間で齟齬のある箇所や、Rust 固有の判断がいくつかある。M4-T2（TS 同等性 golden test）
で契約を固定する際の前提となるため、ここに明記する。

## 問題点（仕様と実装の齟齬・Rust 固有の判断）

### 1. `cols` 列投影はエンジン内で未適用（TS core と同一挙動）

`docs/dev/m0-t3-searchcards-filter-spec.md` §6 は「エンジン内で `cols` 投影を適用することを
推奨」とするが、TS `card-search-core.ts` の `searchCards` 本体は `cols` を受領するのみで
**結果に適用していない**（全ヘッダ列を持つ `Card` を返す）。実際の投影は seek パイプライン等の
呼び出し側が担う。

Rust 側は TS の挙動（code が真理）に合わせ、`search_cards` は `cols` を未適用のまま全件
`Card` を返す。`CardSearchParams.cols` は API 互換のため受領のみ。投影は M2-T3
（seek/pipeline）で扱う。

### 2. text / name 列の既定マッチは exact（`===`）で「含む」ではない

M0-T3 仕様 §8 の fixture 説明文は `text: 'ドラゴン -"青眼"' → text に ドラゴン を含み…`
のように「含む（contains）」と記述するが、TS `valueMatches` は text 系・一般列とも
**mode が `exact`（既定）のとき厳密等価（`===`）**で照合する。`partial`（`includes`）は
`name` 列かつ `mode:'partial'` 指定時のみ。否定句（`-"..."`）を除去した残りパターンも
同じ exact 規則で照合する。

Rust 移植は TS 実装（exact）に忠実。仕様説明文の「を含み」は厳密には不正確。
M4-T2 の golden test は**実装挙動（exact 既定）**を基準に作ること。

### 3. FAQ `matchesQuery` の query 側は `toLowerCase()` のみ（正規化なし）

`search-faq.ts` の `matchesQuery(normalized, query)` は `normalized`（正規化済み）に対し、
query 側は `toLowerCase()` のみで `normalizeForSearch` を通さない。そのため query に記号・
全角が含まれるとマッチ漏れが起き得る。Rust もこの挙动を忠実に再現（`matches_query`）。

### 4. wildcard の `i` フラグ相当は双方 `to_lowercase` で再現

TS の wildcard regex は `new RegExp(..., 'i')`（case-insensitive）。Rust 側は regex コンパイル
（カード毎のコンパイルコスト）を避けるため自前の `glob_match` / `glob_contains` を実装し、
`i` フラグ相当はパターン・対象の両者を `to_lowercase` して再現している。
`flagAutoModify=true`（既定）では両者とも `normalize_for_search` 済みで小文字化済みのため
実質 no-op。`flagAutoModify=false` + wildcard のレアケースでのみ差異に影響する。

### 5. `load_faq_index` はマップを毎回構築（index レベルのキャッシュ無し）

TS `loadFAQIndex` はモジュール変数で index をメモ化するが、Rust 版は TSV パース
（`load_faqs`、キャッシュ済み）から毎回 `by_id` / `normalized` / `by_card_id` を線形構築する。
FAQ 件数に対して線形なので実用上は問題ないが、高頻度呼び出し時は index キャッシュの追加を
検討値。`clear_cache` との整合にも注意。

## 改善案

- §1: `cols` 投影ユーティリティを M2-T3 で追加し、`search_cards` には適用しない方針を維持。
- §2: M4-T2 で実装挙動（exact 既定）に基づく golden test を作成し、TS と同等性を固定。
  仕様メモ §8 の説明文も実装に合わせて修正する。
- §3: 意図的挙動（TS 同等性優先）。修正する場合は TS 側と合わせて両直し。
- §5: 必要なら `FAQIndex` 専用の `OnceLock` キャッシュを `cache.rs` に追加。

## 優先度

low（現状で TS 同等性は担保されており、M4-T2 で契約固定時に再評価）

## 関連

- タスク: TASK-12（[M2-T2] 汎用フィルタ+TS互換ラッパ）
- 仕様: `docs/dev/m0-t3-searchcards-filter-spec.md` §2〜§8
- 設計: `tmp/dev/plan/design.md` §8.1-8.2
- 関連ファイル: `crates/ygo-search/src/fs/filter.rs`, `crates/ygo-search/src/fs/search.rs`
