//! LanceDB 相互運用テスト（M4-T2、設計書 §4-3 / `m3-t3-indexer-decisions.md` 相互運用検証）。
//!
//! TS(`@lancedb/lancedb` 0.31) が作成した LanceDB DB を Rust が open/search する方向（**TS→Rust**）を検証する。
//! 逆方向（**Rust→TS**）は Lance 形式の対称性と PoC(`tmp/dev/poc/vector-poc/ts/search-rust-db.ts`)で担保する。
//! `cargo test` は TS を実行できないため、ここでは Rust 側からの片方向のみ自動化し、逆方向は手動 PoC に委ねる。
//!
//! **重点検証**: TS は JS 数値メタデータを `Float64` で格納する（gen-ts-fixture.mjs の推論結果で実証済み）。
//! Rust の `exclude.faqIds` は `Int64` リテラルでフィルタするため、TS 作成 DB の `Float64` 列と整合するかが
//! `m3-t3-indexer-decisions.md` の残課題だった。本テストがその実測検証である。
//!
//! fixture は `tests/fixtures/lancedb/ts-workdir/` にコミット済み（`gen-ts-fixture.mjs` で再生成）。
#![cfg(feature = "vector-search")]

use std::sync::{Mutex, MutexGuard};

use arrow_schema::DataType;

use ygo_search::types::{ExcludeOptions, FilterValue, QueryInput, VectorSearchOptions};
use ygo_search::vector::{list_tables, search_table};

/// 同一テストバイナリ内で YGO_SEARCH_WORKDIR の排他を取る（vector.rs と同パターン）。
/// ※ tests/*.rs は別プロセスになるため、vector.rs/vector_indexer.rs とは競合しない。
static SERIAL: Mutex<()> = Mutex::new(());

fn fixture_workdir() -> String {
    format!(
        "{}/tests/fixtures/lancedb/ts-workdir",
        env!("CARGO_MANIFEST_DIR")
    )
}

/// SERIAL ガードを取りつつ、fixture の workdir を指す。
fn lock_fixture() -> MutexGuard<'static, ()> {
    let guard = SERIAL.lock().unwrap();
    std::env::set_var("YGO_SEARCH_WORKDIR", fixture_workdir());
    guard
}

fn query_card() -> QueryInput {
    QueryInput::Vector(vec![1.0, 0.0, 0.0])
}

fn query_faq() -> QueryInput {
    QueryInput::Vector(vec![0.9, 0.1, 0.0])
}

#[test]
fn opens_ts_created_db_and_lists_tables() {
    let _g = lock_fixture();
    let mut tables = list_tables().expect("list_tables");
    tables.sort();
    assert_eq!(tables, vec!["cards".to_string(), "faqs".to_string()]);
}

#[test]
fn searches_ts_created_cards_table() {
    let _g = lock_fixture();
    let results = search_table(
        "cards",
        &query_card(),
        &VectorSearchOptions {
            limit: Some(10),
            ..Default::default()
        },
    )
    .expect("search_table cards");
    assert_eq!(results.len(), 4);
    assert_eq!(results[0].id, "c1"); // [1,0,0] に一致
}

#[test]
fn filters_ts_cards_by_string_metadata() {
    let _g = lock_fixture();
    let mut filter = std::collections::BTreeMap::new();
    filter.insert(
        "category".to_string(),
        FilterValue::Str("dragon".to_string()),
    );
    let results = search_table(
        "cards",
        &query_card(),
        &VectorSearchOptions {
            limit: Some(10),
            filter: Some(filter),
            ..Default::default()
        },
    )
    .expect("search_table cards");
    let mut ids: Vec<&str> = results.iter().map(|r| r.id.as_str()).collect();
    ids.sort();
    assert_eq!(ids, vec!["c1", "c2"]);
}

#[test]
fn filters_ts_cards_by_float64_numeric_range() {
    // TS 作成 DB では level は Float64。Rust の Range リテラルも f64 なので整合するはず。
    let _g = lock_fixture();
    let mut filter = std::collections::BTreeMap::new();
    filter.insert(
        "level".to_string(),
        FilterValue::Range {
            min: Some(5.0),
            max: None,
        },
    );
    let results = search_table(
        "cards",
        &query_card(),
        &VectorSearchOptions {
            limit: Some(10),
            filter: Some(filter),
            ..Default::default()
        },
    )
    .expect("search_table cards");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "c1");
}

/// 重点検証: TS 作成 DB の faqId は Float64。Rust の exclude.faqIds は Int64 リテラルで
/// `metadata.faqId IN (...)` を組む。Float64 列に対して Int64 リテラルが hit するか（残課題の実測）。
#[test]
fn excludes_faq_ids_on_ts_created_faqs_table() {
    let _g = lock_fixture();
    let results = search_table(
        "faqs",
        &query_faq(),
        &VectorSearchOptions {
            limit: Some(10),
            exclude: Some(ExcludeOptions {
                faq_ids: Some(vec!["201".to_string()]),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("search_table faqs");
    let ids: Vec<&str> = results.iter().map(|r| r.id.as_str()).collect();
    assert!(
        !ids.contains(&"f1"),
        "exclude.faqIds=201 が Float64 列で機能せず f1 が残った: {ids:?}"
    );
    assert_eq!(results.len(), 2);
}

#[test]
fn excludes_categories_on_ts_created_faqs_table() {
    let _g = lock_fixture();
    let results = search_table(
        "faqs",
        &query_faq(),
        &VectorSearchOptions {
            limit: Some(10),
            exclude: Some(ExcludeOptions {
                categories: Some(vec!["dragon".to_string()]),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .expect("search_table faqs");
    let mut ids: Vec<&str> = results.iter().map(|r| r.id.as_str()).collect();
    ids.sort();
    assert_eq!(ids, vec!["f2", "f3"]);
}

/// fixture のスキーマ前提の自己検証: TS 作成 DB では数値メタデータが `Float64` で
/// 格納されることが本ファイルのフィルタ検証（特に `exclude.faqIds` の Int64 リテラル）の
/// 前提である。fixture 再生成で列が `Int64` 等に変わると前提が崩れるため、ここで検出する。
#[test]
fn fixture_schema_has_float64_numeric_metadata() {
    let _g = lock_fixture();
    let db_dir = format!("{}/data/vector", fixture_workdir());
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let db = lancedb::connect(&db_dir)
            .execute()
            .await
            .expect("connect fixture db");
        for (table, field_name) in [("faqs", "faqId"), ("cards", "level")] {
            let tbl = db
                .open_table(table)
                .execute()
                .await
                .unwrap_or_else(|e| panic!("open_table {table}: {e}"));
            let schema = tbl
                .schema()
                .await
                .unwrap_or_else(|e| panic!("schema {table}: {e}"));
            let metadata_field = schema
                .field_with_name("metadata")
                .unwrap_or_else(|e| panic!("{table}.metadata column missing: {e}"));
            let struct_fields = match metadata_field.data_type() {
                DataType::Struct(fields) => fields,
                other => panic!("{table}.metadata must be Struct: {other:?}"),
            };
            let target = struct_fields
                .iter()
                .find(|f| f.name() == field_name)
                .unwrap_or_else(|| panic!("{table}.metadata.{field_name} column missing"));
            assert_eq!(
                target.data_type(),
                &DataType::Float64,
                "{table}.metadata.{field_name} must be Float64 (fixture schema premise)"
            );
        }
    });
}
