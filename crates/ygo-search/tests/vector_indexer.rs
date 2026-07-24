//! indexer（M3-T3）の統合テスト。
//!
//! `parse_jsonl` / `build_record_batch`（metadata 推論 Struct）は model 不要で常時実行。
//! `create_index` / `index_from_jsonl` の embedding 経路は model ファイル（~113MB, 未同梱）を要するため
//! `#[ignore]`（`YGO_SEARCH_MODEL_DIR` 指定で手動実行）。
#![cfg(feature = "vector-search")]

use std::collections::BTreeMap;
use std::sync::Mutex;

use arrow_schema::DataType;
use serde_json::{json, Value};
use tempfile::tempdir;

use ygo_search::types::{FilterValue, QueryInput, VectorRecord, VectorSearchOptions};
use ygo_search::vector::indexer::{build_record_batch, parse_jsonl};
use ygo_search::vector::{create_index, index_from_jsonl, search_table, vector_search_cards, VectorError};

/// env（`YGO_SEARCH_WORKDIR`）を触るテストの直列化ガード（process-global なため）。
static SERIAL: Mutex<()> = Mutex::new(());

struct Workdir {
    dir: tempfile::TempDir,
}

impl Workdir {
    /// `SERIAL` ガード保持下で呼ぶこと。
    fn new() -> Self {
        let dir = tempdir().expect("tempdir");
        std::env::set_var("YGO_SEARCH_WORKDIR", dir.path());
        Self { dir }
    }

    fn path(&self) -> &std::path::Path {
        self.dir.path()
    }
}

fn sample_records() -> Vec<VectorRecord> {
    vec![
        VectorRecord {
            id: "card-1".into(),
            text: "Blue-Eyes White Dragon".into(),
            metadata: json!({"cardId": 1, "cardType": "monster", "attribute": "LIGHT"}),
        },
        VectorRecord {
            id: "card-2".into(),
            text: "Dark Magician".into(),
            metadata: json!({"cardId": 2, "cardType": "monster", "attribute": "DARK"}),
        },
        VectorRecord {
            id: "card-3".into(),
            text: "Mystical Space Typhoon".into(),
            metadata: json!({"cardId": 3, "cardType": "spell"}),
        },
    ]
}

/// card-1 ≈ [1,0,0], card-3 ≈ [0,1,0], card-2 は中間。
fn sample_vectors() -> Vec<Vec<f32>> {
    vec![vec![1.0, 0.0, 0.0], vec![0.6, 0.4, 0.0], vec![0.0, 1.0, 0.0]]
}

// =============================================================================
// parse_jsonl（model 不要）
// =============================================================================

#[test]
fn parse_jsonl_reads_records_and_skips_blank() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("in.jsonl");
    std::fs::write(
        &path,
        concat!(
            r#"{"id":"a","text":"alpha","metadata":{"k":1}}"#,
            "\n",
            "\n",
            r#"{"id":"b","text":"beta"}"#,
            "\n",
        ),
    )
    .unwrap();

    let records = parse_jsonl(&path).expect("parse_jsonl");
    assert_eq!(records.len(), 2);
    assert_eq!(records[0].id, "a");
    assert_eq!(records[0].metadata, json!({"k": 1}));
    assert_eq!(records[1].id, "b");
    // metadata 省略行は Null（TS `data.metadata || {}` の緩い扱い）
    assert!(records[1].metadata.is_null());
}

#[test]
fn parse_jsonl_empty_file_returns_empty() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("empty.jsonl");
    std::fs::write(&path, "").unwrap();
    assert!(parse_jsonl(&path).unwrap().is_empty());

    // 空白行のみも空扱い
    std::fs::write(&path, "  \n  \n").unwrap();
    assert!(parse_jsonl(&path).unwrap().is_empty());
}

#[test]
fn parse_jsonl_invalid_json_reports_line_number() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("bad.jsonl");
    std::fs::write(
        &path,
        concat!(
            r#"{"id":"a","text":"alpha"}"#,
            "\n",
            "{not valid json}",
            "\n",
        ),
    )
    .unwrap();

    match parse_jsonl(&path).unwrap_err() {
        VectorError::ParseRecord { line, .. } => assert_eq!(line, 2),
        other => panic!("expected ParseRecord, got {other:?}"),
    }
}

// =============================================================================
// build_record_batch（metadata 推論 Struct・model 不要）
// =============================================================================

#[test]
fn build_record_batch_infers_metadata_struct_schema() {
    let batch = build_record_batch(&sample_records(), &sample_vectors()).expect("build");
    let schema = batch.schema();

    // id / text / vector / metadata の4列
    assert_eq!(schema.fields().len(), 4);
    assert_eq!(schema.field_with_name("id").unwrap().data_type(), &DataType::Utf8);
    assert_eq!(schema.field_with_name("text").unwrap().data_type(), &DataType::Utf8);
    assert!(matches!(
        schema.field_with_name("vector").unwrap().data_type(),
        DataType::FixedSizeList(_, 3)
    ));

    // metadata: Struct（キーは BTreeMap 昇順 → attribute, cardId, cardType）
    let struct_fields = match schema.field_with_name("metadata").unwrap().data_type() {
        DataType::Struct(f) => f,
        _ => panic!("metadata must be Struct"),
    };
    let names: Vec<&str> = struct_fields.iter().map(|f| f.name().as_str()).collect();
    assert_eq!(names, vec!["attribute", "cardId", "cardType"]);
    assert_eq!(struct_fields[0].data_type(), &DataType::Utf8); // attribute
    assert_eq!(struct_fields[1].data_type(), &DataType::Int64); // cardId
    assert_eq!(struct_fields[2].data_type(), &DataType::Utf8); // cardType
    // 欠損キーあり得るため全フィールド nullable
    assert!(struct_fields.iter().all(|f| f.is_nullable()));
}

#[test]
fn build_record_batch_empty_records_errors() {
    let err = build_record_batch(&[], &[]).unwrap_err();
    assert!(matches!(err, VectorError::IndexBuild { .. }));
}

#[test]
fn build_record_batch_count_mismatch_errors() {
    let err = build_record_batch(&sample_records(), &sample_vectors()[..2]).unwrap_err();
    assert!(matches!(err, VectorError::IndexBuild { .. }));
}

#[test]
fn build_record_batch_dim_mismatch_errors() {
    let recs = vec![
        VectorRecord { id: "a".into(), text: "x".into(), metadata: json!({}) },
        VectorRecord { id: "b".into(), text: "y".into(), metadata: json!({}) },
    ];
    let vecs = vec![vec![1.0, 0.0, 0.0], vec![0.0, 1.0]];
    let err = build_record_batch(&recs, &vecs).unwrap_err();
    assert!(matches!(err, VectorError::IndexBuild { .. }));
}

#[test]
fn create_index_empty_records_errors() {
    let err = create_index("x", &[]).unwrap_err();
    assert!(matches!(err, VectorError::IndexBuild { .. }));
}

/// 構築した batch を直接 create_table し、既存 `search_table` で id/text/metadata が
/// 期待通り往復することを model なしで検証（スキーマ + 検索の E2E）。
#[test]
fn build_record_batch_roundtrips_via_search() {
    let _guard = SERIAL.lock().unwrap();
    let wd = Workdir::new();

    let batch = build_record_batch(&sample_records(), &sample_vectors()).expect("build");

    // tempdir 配下の vector DB に直接テーブル作成
    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let db_dir = wd.path().join("data").join("vector");
        std::fs::create_dir_all(&db_dir).unwrap();
        let db = lancedb::connect(db_dir.to_str().unwrap()).execute().await.unwrap();
        db.create_table("cards", vec![batch]).execute().await.unwrap();
    });

    // [1,0,0] に近い card-1 が rank1
    let opts = VectorSearchOptions { limit: Some(10), ..Default::default() };
    let results =
        search_table("cards", &QueryInput::Vector(vec![1.0, 0.0, 0.0]), &opts).expect("search");
    assert_eq!(results.len(), 3);
    assert_eq!(results[0].id, "card-1");

    // metadata 往復: Int64 の cardId / Utf8 の cardType が復元される
    let r1 = results.iter().find(|r| r.id == "card-1").unwrap();
    assert_eq!(r1.metadata["cardId"], json!(1));
    assert_eq!(r1.metadata["cardType"], json!("monster"));

    // metadata フィルタ（Utf8 等値）で spell のみ絞り込み
    let mut filter = BTreeMap::new();
    filter.insert("cardType".to_string(), FilterValue::Str("spell".to_string()));
    let opts = VectorSearchOptions { limit: Some(10), filter: Some(filter), ..Default::default() };
    let spell =
        search_table("cards", &QueryInput::Vector(vec![1.0, 0.0, 0.0]), &opts).expect("search");
    assert_eq!(spell.len(), 1);
    assert_eq!(spell[0].id, "card-3");
}

// =============================================================================
// create_index / index_from_jsonl end-to-end（model 必要・手動実行）
// =============================================================================

#[test]
#[ignore = "requires ~113MB ONNX model file, run via YGO_SEARCH_MODEL_DIR"]
fn index_from_jsonl_end_to_end() {
    let _guard = SERIAL.lock().unwrap();
    let wd = Workdir::new();

    let jsonl = wd.path().join("sample.jsonl");
    std::fs::write(
        &jsonl,
        concat!(
            r#"{"id":"card-1","text":"ブルーアイズ・ホワイト・ドラゴン","metadata":{"cardId":1,"cardType":"monster"}}"#,
            "\n",
            r#"{"id":"card-2","text":"ブラック・マジシャン","metadata":{"cardId":2,"cardType":"monster"}}"#,
            "\n",
        ),
    )
    .unwrap();

    index_from_jsonl("cards", &jsonl).expect("index_from_jsonl");

    // テキストクエリ（embedding 経由）でドラゴンを検索 → card-1 が rank1
    let opts = VectorSearchOptions { limit: Some(5), ..Default::default() };
    let results = vector_search_cards("ドラゴン", &opts).expect("vector_search_cards");
    assert!(!results.is_empty());
    assert_eq!(results[0].id, "card-1");

    // 念のため metadata の形も確認（未使用警告抑制を兼ねる）
    let _: &Value = &results[0].metadata;
}
