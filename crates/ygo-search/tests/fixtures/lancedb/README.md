# LanceDB 相互運用テスト用 fixture

`tests/vector_interop.rs` が使用する、**TS(`@lancedb/lancedb` 0.31)が作成した LanceDB DB** のコミット済み fixture。

## 目的

`m3-t3-indexer-decisions.md` に記録された残課題「TS 作成 DB の整数値メタデータが `Float64` で格納され、Rust 側の `Int64` リテラルフィルタ(`exclude.faqIds`)と整合するか」を実測検証するための golden fixture。モデルファイル不要（ハードコード `dim=3` ベクトル）。

## 構成

```
ts-workdir/                  # YGO_SEARCH_WORKDIR が指す workdir
  data/vector/
    cards.lance/             # metadata: { category:Utf8, level:Float64 }
    faqs.lance/              # metadata: { category:Utf8, faqId:Float64 }
```

TS は JS の `number` をスキーマ推論で `Float64` にするため、`level`/`faqId` は整数リテラルで与えても `Float64` 列になる（これが検証対象）。`vector` は `FixedSizeList[3]<Float32>`（Rust 期待値と一致）。

## 再生成

`@lancedb/lancedb` の版を上げた場合や、レコード構成を変える場合は再生成する。プロジェクトルートの `node_modules`（pnpm）を利用。

```sh
cd /home/tomo/work/app/ygo/ygo-search
node crates/ygo-search/tests/fixtures/lancedb/gen-ts-fixture.mjs
```

生成後、`git diff` で `.lance` 配下に大幅な差分が出ていないか確認すること（スキーマ非互換の兆候）。

## 実行

```sh
cargo test -p ygo-search --no-default-features --features vector-search --test vector_interop
```

## 備考

- 逆方向（Rust 作成 DB を TS が開く）は `cargo test` では検証不可（TS 実行が必要）。PoC `tmp/dev/poc/vector-poc/ts/search-rust-db.ts` で手動担保する。
- fixture は読み取り専用で使用する（テストは `search_table`/`list_tables` のみで書き込まない）。
