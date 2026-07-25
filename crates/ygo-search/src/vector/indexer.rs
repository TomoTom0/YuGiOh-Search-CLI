//! index 構築（M3-T3）。`index_from_jsonl` / `create_index`。
//!
//! TS `src/lib/vector/indexer.ts` の Rust 移植。jsonl 読込 → バッチ embedding → `lancedb::create_table`。
//! `vector-search` feature 配下（jsonl 読込は std::fs + serde_json の inline で `fs` feature 非依存、TS と同一）。
//!
//! **metadata 列**: 全レコードの metadata キー和集合から Arrow Struct スキーマを推論し構築する。
//! 型は値から推論（int→Int64, float→Float64, bool→Boolean, string→Utf8, object/array→Utf8(JSON文字列)）。
//! 検索側 `get_field(metadata, key)` のフィルタが Rust 構築 DB でも機能する（設計書 §11）。

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::Arc;

use arrow_array::{
    builder::StructBuilder, Array, ArrayRef, BooleanArray, FixedSizeListArray, Float32Array,
    Float64Array, Int64Array, RecordBatch, StringArray, StructArray,
};
use arrow_schema::{DataType, Field, Fields, Schema};
use lancedb::database::CreateTableMode;
use serde::Deserialize;
use serde_json::Value;

use crate::types::VectorRecord;

use super::embeddings::generate_embeddings;
use super::{connect_db, runtime, VectorError};

/// JSONL 1 行分（`metadata` 省略時は Null、TS `data.metadata || {}` の緩い扱いに対応）。
#[derive(Deserialize)]
struct JsonlRecord {
    id: String,
    text: String,
    #[serde(default)]
    metadata: Value,
}

/// JSONL ファイルを読み込み `VectorRecord` 列に変換する（TS `indexFromJsonl` の読込部）。
///
/// 空行はスキップ。`metadata` が省略された行は `Value::Null`（構築時に空 metadata 扱い）。
/// 各行のパース失敗は [`VectorError::ParseRecord`]（1始まりの行番号付き）。
pub fn parse_jsonl(path: &Path) -> Result<Vec<VectorRecord>, VectorError> {
    let content = std::fs::read_to_string(path)?;
    let mut records = Vec::new();
    for (idx, line) in content.lines().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let rec: JsonlRecord = serde_json::from_str(trimmed).map_err(|e| VectorError::ParseRecord {
            line: idx + 1,
            message: e.to_string(),
        })?;
        records.push(VectorRecord {
            id: rec.id,
            text: rec.text,
            metadata: rec.metadata,
        });
    }
    Ok(records)
}

/// metadata 値の推論型カテゴリ。
#[derive(Clone, Copy, PartialEq)]
enum Cat {
    /// 値無し（他の具象型が現れるまで保留）。
    Null,
    Bool,
    /// `as_i64` で収まる整数。
    Int,
    Float,
    Str,
    /// オブジェクト/配列（Utf8 の JSON 文字列として保持）。
    Json,
}

impl Cat {
    fn of(v: &Value) -> Self {
        match v {
            Value::Null => Self::Null,
            Value::Bool(_) => Self::Bool,
            Value::Number(n) => {
                if n.as_i64().is_some() {
                    Self::Int
                } else {
                    Self::Float
                }
            }
            Value::String(_) => Self::Str,
            Value::Array(_) | Value::Object(_) => Self::Json,
        }
    }

    /// 2 カテゴリの和（ widening ）。優先度: Json > Str > (Int+Float→Float) > Bool > Null。
    fn merge(self, other: Self) -> Self {
        match (self, other) {
            (Self::Null, x) | (x, Self::Null) => x,
            (Self::Json, _) | (_, Self::Json) => Self::Json,
            (Self::Str, _) | (_, Self::Str) => Self::Str,
            (Self::Float, Self::Int) | (Self::Int, Self::Float) | (Self::Float, Self::Float) => {
                Self::Float
            }
            (Self::Int, Self::Int) => Self::Int,
            (Self::Bool, Self::Bool) => Self::Bool,
            // Bool と数値の混在は文字列へ寄せる（型の矛盾を安全側に倒す）。
            (Self::Bool, _) | (_, Self::Bool) => Self::Str,
        }
    }

    fn datatype(self) -> DataType {
        match self {
            Self::Null => DataType::Utf8,
            Self::Bool => DataType::Boolean,
            Self::Int => DataType::Int64,
            Self::Float => DataType::Float64,
            Self::Str | Self::Json => DataType::Utf8,
        }
    }
}

/// 全レコードの metadata から（キー, 推論型）の列を推論する（BTreeMap でキー昇順・決定的）。
fn infer_metadata_fields(records: &[VectorRecord]) -> Vec<(String, DataType)> {
    let mut cats: BTreeMap<String, Cat> = BTreeMap::new();
    for r in records {
        if let Some(map) = r.metadata.as_object() {
            for (k, v) in map {
                let c = Cat::of(v);
                cats.entry(k.clone())
                    .and_modify(|acc| *acc = acc.merge(c))
                    .or_insert(c);
            }
        }
    }
    cats.into_iter().map(|(k, c)| (k, c.datatype())).collect()
}

/// 指定キーのメタデータ値を取り出す（metadata が object でない場合は None）。
fn meta_value<'a>(r: &'a VectorRecord, key: &str) -> Option<&'a Value> {
    r.metadata.as_object().and_then(|m| m.get(key))
}

/// 1 メタデータキーの Arrow 配列を構築する（対象 DataType に従って値を変換、欠損は null）。
fn build_field_array(
    records: &[VectorRecord],
    key: &str,
    dt: &DataType,
) -> Result<ArrayRef, VectorError> {
    let arr: ArrayRef = match dt {
        DataType::Int64 => {
            let vals: Vec<Option<i64>> =
                records.iter().map(|r| meta_value(r, key).and_then(|v| v.as_i64())).collect();
            Arc::new(Int64Array::from(vals))
        }
        DataType::Float64 => {
            let vals: Vec<Option<f64>> =
                records.iter().map(|r| meta_value(r, key).and_then(|v| v.as_f64())).collect();
            Arc::new(Float64Array::from(vals))
        }
        DataType::Boolean => {
            let vals: Vec<Option<bool>> =
                records.iter().map(|r| meta_value(r, key).and_then(|v| v.as_bool())).collect();
            Arc::new(BooleanArray::from(vals))
        }
        // Utf8: 文字列はそのまま、それ以外（数値/bool/オブジェクト/配列）は JSON 文字列化。
        DataType::Utf8 => {
            let vals: Vec<Option<String>> = records
                .iter()
                .map(|r| -> Result<Option<String>, VectorError> {
                    match meta_value(r, key) {
                        None | Some(Value::Null) => Ok(None),
                        Some(Value::String(s)) => Ok(Some(s.clone())),
                        Some(other) => Ok(Some(render_scalar(other)?)),
                    }
                })
                .collect::<Result<_, _>>()?;
            let refs: Vec<Option<&str>> = vals.iter().map(|o| o.as_deref()).collect();
            Arc::new(StringArray::from(refs))
        }
        _ => {
            return Err(VectorError::IndexBuild {
                message: format!("サポート外の metadata 型です (key={key}, type={dt:?})"),
            });
        }
    };
    Ok(arr)
}

/// スカラー値を JSON 文字列化する（Utf8 列への強制時）。失敗は IndexBuild エラー。
fn render_scalar(v: &Value) -> Result<String, VectorError> {
    serde_json::to_string(v).map_err(|e| VectorError::IndexBuild {
        message: format!("metadata 値の直列化に失敗しました: {e}"),
    })
}

/// レコード列 + ベクトル列から [`RecordBatch`] を構築する（純粋・model 不要・テスト対象）。
///
/// スキーマ: `id: Utf8`, `text: Utf8`, `vector: FixedSizeList<f32, dim>`,
/// および `metadata: Struct`。metadata キーが1つも無い場合は空フィールド Struct（空オブジェクト表現）
/// で列を保持し、検索時に `{}` として復元される（TS `data.metadata || {}` 契約）。
pub fn build_record_batch(
    records: &[VectorRecord],
    vectors: &[Vec<f32>],
) -> Result<RecordBatch, VectorError> {
    if records.is_empty() {
        return Err(VectorError::IndexBuild {
            message: "インデックス対象のレコードが空です".to_string(),
        });
    }
    if records.len() != vectors.len() {
        return Err(VectorError::IndexBuild {
            message: format!(
                "レコード数({})とベクトル数({})が一致しません",
                records.len(),
                vectors.len()
            ),
        });
    }
    let dim = vectors[0].len() as i32;
    if dim == 0 || !vectors.iter().all(|v| v.len() as i32 == dim) {
        return Err(VectorError::IndexBuild {
            message: format!("ベクトル次元が不整合または空です（期待 dim={dim}）"),
        });
    }

    let ids: Vec<&str> = records.iter().map(|r| r.id.as_str()).collect();
    let texts: Vec<&str> = records.iter().map(|r| r.text.as_str()).collect();

    // vector 列: FixedSizeList<f32, dim>
    let flat: Vec<f32> = vectors.iter().flatten().copied().collect();
    let vector_item = Arc::new(Field::new("item", DataType::Float32, true));
    let vector_array =
        FixedSizeListArray::try_new(vector_item, dim, Arc::new(Float32Array::from(flat)), None)
            .map_err(|e| VectorError::IndexBuild {
                message: format!("vector 列の構築に失敗しました: {e}"),
            })?;

    let mut fields: Vec<Field> = vec![
        Field::new("id", DataType::Utf8, false),
        Field::new("text", DataType::Utf8, false),
        Field::new(
            "vector",
            DataType::FixedSizeList(Arc::new(Field::new("item", DataType::Float32, true)), dim),
            false,
        ),
    ];
    let mut columns: Vec<ArrayRef> = vec![
        Arc::new(StringArray::from(ids)),
        Arc::new(StringArray::from(texts)),
        Arc::new(vector_array),
    ];

    // metadata 列: 推論 Struct。全レコード空 metadata の場合は空フィールド Struct（空オブジェクト表現）
    // で列を保持し、検索時に `{}` として復元させる（TS `data.metadata || {}` 契約・SDKコントラクト維持）。
    let meta_defs = infer_metadata_fields(records);
    let struct_array: StructArray = if meta_defs.is_empty() {
        // 空フィールドでも行数分の長さを持つ StructArray を構築するため StructBuilder を使用。
        // 各行は valid（null ではなく空オブジェクト）とし、検索デコードで {} となるようにする。
        let mut builder = StructBuilder::new(Fields::default(), Vec::new());
        for _ in records {
            builder.append(true);
        }
        builder.finish()
    } else {
        let mut meta_fields: Vec<Field> = Vec::with_capacity(meta_defs.len());
        let mut meta_arrays: Vec<ArrayRef> = Vec::with_capacity(meta_defs.len());
        for (key, dt) in &meta_defs {
            meta_fields.push(Field::new(key, dt.clone(), true));
            meta_arrays.push(build_field_array(records, key, dt)?);
        }
        StructArray::new(Fields::from(meta_fields), meta_arrays, None)
    };
    let metadata_type = struct_array.data_type().clone();
    fields.push(Field::new("metadata", metadata_type, false));
    columns.push(Arc::new(struct_array));

    let schema = Arc::new(Schema::new(fields));
    RecordBatch::try_new(schema, columns).map_err(|e| VectorError::IndexBuild {
        message: format!("RecordBatch 構築に失敗しました: {e}"),
    })
}

/// テーブルを構築する（TS `createIndex` 相当）。
///
/// 全レコードの `text` から embedding を生成し、[`build_record_batch`] で
/// `RecordBatch` を組み立て、LanceDB に上書き作成（`CreateTableMode::Overwrite`）する。
pub fn create_index(table: &str, records: &[VectorRecord]) -> Result<(), VectorError> {
    if records.is_empty() {
        return Err(VectorError::IndexBuild {
            message: "インデックス対象のレコードが空です".to_string(),
        });
    }
    eprintln!("テーブルを作成中: {table}");
    eprintln!("レコード数: {}", records.len());

    eprintln!("Embeddingを生成中...");
    let texts: Vec<&str> = records.iter().map(|r| r.text.as_str()).collect();
    let vectors = generate_embeddings(&texts)?;

    let batch = build_record_batch(records, &vectors)?;

    eprintln!("LanceDBに接続中...");
    runtime().block_on(async {
        let db = connect_db().await?;
        db.create_table(table, vec![batch])
            .mode(CreateTableMode::Overwrite)
            .execute()
            .await
            .map_err(|e| VectorError::IndexBuild {
                message: format!("create_table に失敗しました: {e}"),
            })?;
        Ok::<(), VectorError>(())
    })?;

    eprintln!("インデックス作成完了: {table} ({}件)", records.len());
    Ok(())
}

/// JSONL ファイルからインデックスを構築する（TS `indexFromJsonl` 相当）。
pub fn index_from_jsonl(table: &str, jsonl_path: &Path) -> Result<(), VectorError> {
    eprintln!("JSONLファイルを読み込み中: {}", jsonl_path.display());
    let records = parse_jsonl(jsonl_path)?;
    create_index(table, &records)
}
