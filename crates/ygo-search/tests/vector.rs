//! vector-search feature: lancedb 接続・list_tables・search_table・where 式の統合テスト。
//!
//! embedding 推論（`generate_embedding`）はモデルファイル（~450MB, 未同梱）を要するため、
//! ここでは `QueryInput::Vector` で直接ベクトルを渡すテストのみを行う。
//! `vector_search_cards`/`vector_search_faqs`/`vector_search_all`（テキストクエリ経由）と
//! embedding 一致性（golden）は `tests/vector_embeddings.rs`（`#[ignore]`、モデル配置時のみ手動実行）を参照。
#![cfg(feature = "vector-search")]

use std::sync::{Arc, Mutex};

use arrow_array::{
    FixedSizeListArray, Float32Array, Float64Array, RecordBatch, StringArray, StructArray,
};
use arrow_schema::{DataType, Field, Fields, Schema};

use ygo_search::types::{ExcludeOptions, FilterValue, QueryInput, VectorSearchOptions};
use ygo_search::vector::{list_tables, search_table, VectorError};

static SERIAL: Mutex<()> = Mutex::new(());

struct Workdir {
    _dir: tempfile::TempDir,
}

impl Workdir {
    /// `SERIAL` ガード保持下で呼ぶこと。
    fn new() -> Self {
        let dir = tempfile::tempdir().expect("tempdir");
        std::env::set_var("YGO_SEARCH_WORKDIR", dir.path());
        Self { _dir: dir }
    }
}

fn cards_schema() -> Arc<Schema> {
    let metadata_fields = Fields::from(vec![
        Field::new("category", DataType::Utf8, false),
        Field::new("level", DataType::Float64, false),
    ]);
    Arc::new(Schema::new(vec![
        Field::new("id", DataType::Utf8, false),
        Field::new("text", DataType::Utf8, false),
        Field::new(
            "vector",
            DataType::FixedSizeList(Arc::new(Field::new("item", DataType::Float32, true)), 3),
            false,
        ),
        Field::new("metadata", DataType::Struct(metadata_fields), false),
    ]))
}

/// c1/c2 は query=[1,0,0] に近い（cosine 距離 ~0 / ~0.006）、c3/c4 は直交（距離 1.0）。
fn cards_batch() -> RecordBatch {
    let schema = cards_schema();
    let ids = vec!["c1", "c2", "c3", "c4"];
    let texts = vec!["Dragon A", "Dragon B", "Spell A", "Trap A"];
    let vectors: Vec<f32> = vec![
        1.0, 0.0, 0.0, //
        0.9, 0.1, 0.0, //
        0.0, 1.0, 0.0, //
        0.0, 0.0, 1.0, //
    ];
    let categories = vec!["dragon", "dragon", "spell", "trap"];
    let levels = vec![8.0, 4.0, 0.0, 0.0];

    let vector_field = Arc::new(Field::new("item", DataType::Float32, true));
    let vector_values = Float32Array::from(vectors);
    let vector_array =
        FixedSizeListArray::try_new(vector_field, 3, Arc::new(vector_values), None).unwrap();

    let metadata_fields = Fields::from(vec![
        Field::new("category", DataType::Utf8, false),
        Field::new("level", DataType::Float64, false),
    ]);
    let metadata = StructArray::new(
        metadata_fields,
        vec![
            Arc::new(StringArray::from(categories)),
            Arc::new(Float64Array::from(levels)),
        ],
        None,
    );

    RecordBatch::try_new(
        schema,
        vec![
            Arc::new(StringArray::from(ids)),
            Arc::new(StringArray::from(texts)),
            Arc::new(vector_array),
            Arc::new(metadata),
        ],
    )
    .unwrap()
}

fn create_cards_table(workdir: &Workdir) {
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let db_dir = workdir._dir.path().join("data").join("vector");
        std::fs::create_dir_all(&db_dir).unwrap();
        let db = lancedb::connect(db_dir.to_str().unwrap())
            .execute()
            .await
            .unwrap();
        db.create_table("cards", vec![cards_batch()])
            .execute()
            .await
            .unwrap();
    });
}

#[test]
fn list_tables_returns_created_table() {
    let _guard = SERIAL.lock().unwrap();
    let wd = Workdir::new();
    create_cards_table(&wd);

    let tables = list_tables().expect("list_tables");
    assert_eq!(tables, vec!["cards".to_string()]);
}

#[test]
fn list_tables_empty_when_no_db() {
    let _guard = SERIAL.lock().unwrap();
    let _wd = Workdir::new();

    let tables = list_tables().expect("list_tables");
    assert!(tables.is_empty());
}

#[test]
fn search_table_orders_by_vector_distance() {
    let _guard = SERIAL.lock().unwrap();
    let wd = Workdir::new();
    create_cards_table(&wd);

    let query = QueryInput::Vector(vec![1.0, 0.0, 0.0]);
    let opts = VectorSearchOptions {
        limit: Some(10),
        ..Default::default()
    };
    let results = search_table("cards", &query, &opts).expect("search_table");

    assert_eq!(results.len(), 4);
    assert_eq!(results[0].id, "c1");
    assert!(results[0].score < 1e-6);
    assert_eq!(results[1].id, "c2");
    assert!(results[1].score > 0.0 && results[1].score < 0.1);
}

#[test]
fn search_table_filters_by_metadata_equality() {
    let _guard = SERIAL.lock().unwrap();
    let wd = Workdir::new();
    create_cards_table(&wd);

    let query = QueryInput::Vector(vec![1.0, 0.0, 0.0]);
    let mut filter = std::collections::BTreeMap::new();
    filter.insert(
        "category".to_string(),
        FilterValue::Str("dragon".to_string()),
    );
    let opts = VectorSearchOptions {
        limit: Some(10),
        filter: Some(filter),
        ..Default::default()
    };
    let results = search_table("cards", &query, &opts).expect("search_table");

    let mut ids: Vec<&str> = results.iter().map(|r| r.id.as_str()).collect();
    ids.sort();
    assert_eq!(ids, vec!["c1", "c2"]);
}

#[test]
fn search_table_filters_by_metadata_range() {
    let _guard = SERIAL.lock().unwrap();
    let wd = Workdir::new();
    create_cards_table(&wd);

    let query = QueryInput::Vector(vec![1.0, 0.0, 0.0]);
    let mut filter = std::collections::BTreeMap::new();
    filter.insert(
        "level".to_string(),
        FilterValue::Range {
            min: Some(5.0),
            max: None,
        },
    );
    let opts = VectorSearchOptions {
        limit: Some(10),
        filter: Some(filter),
        ..Default::default()
    };
    let results = search_table("cards", &query, &opts).expect("search_table");

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, "c1");
}

#[test]
fn search_table_excludes_ids() {
    let _guard = SERIAL.lock().unwrap();
    let wd = Workdir::new();
    create_cards_table(&wd);

    let query = QueryInput::Vector(vec![1.0, 0.0, 0.0]);
    let opts = VectorSearchOptions {
        limit: Some(10),
        exclude: Some(ExcludeOptions {
            ids: Some(vec!["c1".to_string()]),
            ..Default::default()
        }),
        ..Default::default()
    };
    let results = search_table("cards", &query, &opts).expect("search_table");

    assert!(!results.iter().any(|r| r.id == "c1"));
    assert_eq!(results.len(), 3);
}

#[test]
fn search_table_excludes_categories() {
    let _guard = SERIAL.lock().unwrap();
    let wd = Workdir::new();
    create_cards_table(&wd);

    let query = QueryInput::Vector(vec![1.0, 0.0, 0.0]);
    let opts = VectorSearchOptions {
        limit: Some(10),
        exclude: Some(ExcludeOptions {
            categories: Some(vec!["dragon".to_string()]),
            ..Default::default()
        }),
        ..Default::default()
    };
    let results = search_table("cards", &query, &opts).expect("search_table");

    let mut ids: Vec<&str> = results.iter().map(|r| r.id.as_str()).collect();
    ids.sort();
    assert_eq!(ids, vec!["c3", "c4"]);
}

#[test]
fn search_table_threshold_filters_far_results() {
    let _guard = SERIAL.lock().unwrap();
    let wd = Workdir::new();
    create_cards_table(&wd);

    let query = QueryInput::Vector(vec![1.0, 0.0, 0.0]);
    let opts = VectorSearchOptions {
        limit: Some(10),
        threshold: Some(0.5),
        ..Default::default()
    };
    let results = search_table("cards", &query, &opts).expect("search_table");

    let mut ids: Vec<&str> = results.iter().map(|r| r.id.as_str()).collect();
    ids.sort();
    assert_eq!(ids, vec!["c1", "c2"]);
}

#[test]
fn search_table_rejects_invalid_filter_key() {
    let _guard = SERIAL.lock().unwrap();
    let wd = Workdir::new();
    create_cards_table(&wd);

    let query = QueryInput::Vector(vec![1.0, 0.0, 0.0]);
    let mut filter = std::collections::BTreeMap::new();
    // 識別子として不正なキー（インジェクション対策の whitelist を検証、設計書 §11）
    filter.insert(
        "category = 'x'; --".to_string(),
        FilterValue::Str("dragon".to_string()),
    );
    let opts = VectorSearchOptions {
        limit: Some(10),
        filter: Some(filter),
        ..Default::default()
    };

    let err = search_table("cards", &query, &opts).unwrap_err();
    assert!(matches!(err, VectorError::InvalidFilterKey(_)));
}

#[test]
fn search_table_open_missing_table_errors() {
    let _guard = SERIAL.lock().unwrap();
    let _wd = Workdir::new();

    let query = QueryInput::Vector(vec![1.0, 0.0, 0.0]);
    let opts = VectorSearchOptions::default();
    let err = search_table("no_such_table", &query, &opts).unwrap_err();
    assert!(matches!(err, VectorError::OpenTable { .. }));
}
