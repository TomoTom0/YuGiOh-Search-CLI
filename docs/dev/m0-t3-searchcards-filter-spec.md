# M0-T3 仕様確定メモ：SpellEffectType / searchCards filter

> TASK-7 (M0-T3): 仕様確定(SpellEffectType/filter)
> 作成日: 2026-07-14
> 関連: `tmp/dev/plan/design.md` §8.2 / `tmp/dev/plan/development-plan.md` M0-T3 / `docs/dev/sdk-feature-gap-investigation.md` §10.3 / `docs/dev/m0-t2-contract.md`

M0-T3 では移植（M1/M2）に先立ち、TS 内部で曖昧だった2点を確定し Rust 実装の前提を固定する。
1. `SpellEffectType` の `quick` / `quickPlay` 不一致 → **`quick` に統一**
2. `searchCards` の汎用フィルタ仕様（`filter`/`cols`/`mode`/`includeRuby`/wildcard/否定句）→ `card-search-core.ts` を基に本文書で固定（M2-T2 実装の spec fixture とする）

情報源は権威順に `docs/usage/schema.md` > `src/types/card.ts` > 実装 `src/lib/card-search-core.ts`。

## 1. SpellEffectType の確定：`quick`

### 判断

`'quick'` を正とする。

| 出処 | 値 | 採用 |
|---|---|---|
| `docs/usage/schema.md`（権威） | `quick` | ✓ |
| `src/types/card.ts` 公開型 `SpellEffectType` | `quick` | ✓ |
| `src/lib/vector/converter.ts`（旧） | `quickPlay` | ✗ 修正済 |

Rust 側（M0-T2 で固定済）は `enum SpellEffectType { ..., QuickPlay, ... }` とし、`#[serde(rename = "quick")]` で `quick` に直列化する（`crates/ygo-search/src/types/card.rs`）。variant 名 `QuickPlay` は语义保持のため維持、直列化値のみ `quick`。

### 実施した TS 修正

- `src/lib/vector/converter.ts:96`: typeMap のキー `'quickPlay'` → `'quick'`
- これは**潜在バグの修正でもある**。converter は vector パイプライン（`convertCardsToJsonl` 経由、`src/cli/ygo_search.ts:610` で起動）で稼働中だが、ランタイムの `spellEffectType` は `card.ts` 型の `'quick'` であり、旧キー `'quickPlay'` とは不一致だった。結果として速攻魔法の分類文字列が `'' + '魔法'` = `魔法` となり「速攻」が欠落していた。修正後は `速攻魔法` に正しく化ける。
- テスト: `tests/unit/vector-converter.test.ts`（7 件）。`spellEffectType="quick"` → text に `速攻魔法` が含まれることを固定。

## 2. searchCards / CardSearchParams 仕様

出典: `src/lib/card-search-core.ts`（`src/index.ts:22` で `searchCards` として公開）。

### 2.1 パラメータ

| パラメータ | 型 | デフォルト | 意味 |
|---|---|---|---|
| `filter` | `Record<string, any>` | （必須） | 列名 → 条件。詳細は §2.2 |
| `cols` | `string[] \| null` | `null` | 列投影。**現状コア未適用**（§6 参照） |
| `mode` | `'exact' \| 'partial'` | `'exact'` | `name` 列のマッチモード（§3.1）。他列は常時 `exact` |
| `includeRuby` | `boolean` | `true` | `name` 非合致時に `ruby` 列へフォールバック（§3.1） |
| `flagAutoModify` | `boolean` | `true` | 正規化（§4）を適用するか |
| `flagAllowWild` | `boolean` | `true` | wildcard（§5）を許可するか |

### 2.2 filter 値の 3 形式

`filter` の各値は正規化され `{ op: 'and'|'or', cond: any[] }` になる（`card-search-core.ts:116-127`）。

| 入力形式 | 正規化結果 | 備考 |
|---|---|---|
| スカラー `v` | `{ op:'and', cond:[v] }` | 単一条件 |
| 配列 `[a,b]` | `{ op:'or',  cond:[a,b] }` | **配列は OR** |
| `{ op, cond }` | `{ op: op==='or'?'or':'and', cond: cond配列または[cond] }` | 明示指定。`op` は `'or'` のみ特別扱い、他は `'and'` |

`cond` が空配列/空のときは当該列の検査をスキップ（`f.cond.length === 0`）。

### 2.3 op セマンティクス

- `op === 'or'` → `matches.some(Boolean)`（いずれか合致）
- それ以外（`and`）→ `matches.every(Boolean)`（すべて合致）

列ごとに `passed` を計算し、**全列が `passed`** の行のみ結果に含む（列間は暗黙に AND）。

## 3. フィールド別マッチング挙動

`valueMatches`（`card-search-core.ts:38-98`）の挙動は列によって異なる。

### 3.1 `name` 列（特別扱い）

- `mode` パラメータが適用される唯一の列（他列は常時 `exact`）。
- `nameModified` 列が存在すれば、それを正規化済み値として再利用（`flagAutoModify` 時）。
- `includeRuby` が真かつ `name` で非合致のとき、`ruby` 列で再マッチ（`name` 同様 `mode` 適用、正規化あり、wildcard 許可、text 否定句なし）。

### 3.2 一般列（`cardId`, `attribute`, `race`, ...）

- 常に `exact` モード（`mode` パラメータ無視）。
- `exact`: wildcard なしなら厳密等価、 wildcard あれば §5 の正規表現マッチ。

### 3.3 text 系列（`text`, `pendulumText`, `supplementInfo`, `pendulumSupplementInfo`）

- text 否定句 `-"..."`（§7）を解釈する唯一のグループ。

## 4. 正規化（normalizeForSearch）

`flagAutoModify` が真のとき、検索対象・パターンの両方に以下を適用（`card-search-core.ts:26-36`）。

1. 空白（半角/全角）除去
2. 句読点・記号除去（`・★☆※！？。、,：；「」【】（）[]{}〜～_-/\|&#$%^*+=<>'"` 等、広範）
3. 異体字統一: `竜→龍`、`剣→劍`
4. 全角英数字 → 半角
5. 小文字化
6. ひらがな → カタカナ（`+0x60`）

wildcard パターンは `*` を保持するため、`*` で分割して各部分を個別正規化後に再結合（`card-search-core.ts:59-64`）。

## 5. wildcard（`*`）

- 有効条件: `flagAllowWild && cond.includes('*')`（正規化前に判定）。
- マッチ: `*` で分割 → 各部を正規表現エスケープ → `.*` で結合 → `^...$`（`i` フラグ）でテスト。
- `exact` モード + wildcard で機能。`partial` モードでは `searchTarget.includes(pattern)` が優先され wildcard は効かない点に注意（`card-search-core.ts:87-89`）。

## 6. cols 列投影（仕様と現状のギャップ）

- `CardSearchParams.cols` は公開 API（`src/index.ts:16-18` の例でも掲載）だが、**`card-search-core.ts` の `searchCards` 本体では `cols` を受領するのみで結果に適用していない**（結果は全ヘッダ列を保持した `Card` を返す、`card-search-core.ts:188-200`）。
- 実際の投影は呼び出し側パイプラインが担う:
  - `src/lib/seek-cards.ts:142` `effectiveCols`（seek パイプライン）
  - `src/ygo-seek.ts`（CLI seek 出力投影）
  - `src/bulk-search-cards.ts:31`（CLI 引数 `cols=` として伝播）
- **M2-T2（TSV 汎用フィルタエンジン）での決定事項**: Rust 側 `search_cards` が `cols` を内部適用して部分 `Card` を返すか、全件返却して呼び出し側で投影するか。TS 公開 API の例示と整合させるため、**エンジン内で `cols` 投影を適用する**ことを推奨（部分投影 `Card` を返す）。fixture（§8）は両者の境界を明示する。

## 7. text 否定句（`-"..."`）

text 系列でのみ有効（§3.3）。`cond` が `-"..."` を含むとき（`card-search-core.ts:66-85`）:

1. `-["'\`]([^"'\`]+)["'\`]` で全否定フレーズを抽出。
2. 検索対象がいずれかの（正規化済み）否定フレーズを含めば **不採用（`false`）**。
3. 否定句を除去した残りパターンで通常マッチ。残りが空なら **採用（`true`）**。
4. 残りパターンにも wildcard/正規化ルールを再適用。

引用符は `"`, `'`, `` ` `` のいずれか。例: `ドラゴン -"青眼"` = 「ドラゴン を含み、かつ 青眼 を含まない」。

## 8. 仕様 fixture（M2-T2 実装の基準）

以下の入力 → 期待挙動を M2-T2 実装の acceptance とする。データは `cards-all.tsv` 相当。

```
filter: { name: '青眼の白き龍' }
  → name 列 exact マッチ（正規化で 龍 統一）。ruby フォールバックあり。

filter: { cardId: ['10000', '10001'] }
  → cardId 配列 = OR。いずれかに合致。

filter: { name: { op: 'or', cond: ['青眼', 'ブラック'] }, attribute: '光' }
  → name OR(青眼|ブラック) AND attribute=='光'（exact）。

filter: { name: '青眼*' }, mode: 'exact'
  → wildcard。「青眼」始まり。

filter: { text: 'ドラゴン -"青眼"' }
  → text に ドラゴン を含み 青眼 を含まない。

filter: { name: 'ブルーアイズ' }, mode: 'partial', includeRuby: true
  → name partial（部分一致）。非合致なら ruby 列で部分一致。

filter: { name: 'あいうえお' }, flagAutoModify: true
  → 正規化で カタカナ化。ひらがな/カタカナ/全角半角を吸収。
```

cols 投影（§6 決定次第）:
```
searchCards({ filter:{cardId:'10000'}, cols:['cardId','name','atk'] })
  → M2-T2 推奨: { cardId, name, atk } のみ持つ部分 Card を返す
```

## 9. M1/M2 実装への引継ぎ

- **M1-T1/T2 (TASK-8/9)**: `Card` DTO への統合時、本仕様の列名・マッチ挙動を壊さないこと。
- **M2-T2 (汎用フィルタ+TS互換ラッパ)**: 本文書 §2〜§8 が仕様書。`normalizeForSearch`(§4)・wildcard(§5)・否定句(§7) の Rust 実装が必須。`cols`(§6) の適用層を確定すること。
- **テスト**: 本仕様の fixture(§8) を golden test 化し TS と同等性を検証（M4-T2）。

## 検証結果（本タスク）

- `pnpm vitest run tests/unit/vector-converter.test.ts`: 7 件合格（SpellEffectType 日本語化）
- `grep -rn quickPlay`（src/tests）: 0 件（doc 内の参照記述のみ）
- `cargo test -p ygo-search`: unit 48 + contract 22 = 70 件（回帰なし、Rust 側は既に `quick` で固定済）
