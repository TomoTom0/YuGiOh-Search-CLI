//! Vector 系レコード型（M2-T4 / M3）。
//!
//! TS `src/lib/vector/converter.ts` の `VectorRecord` に相当。
//! `convert_*_to_jsonl`（M2-T4）が生成し、`index_from_jsonl`（M3）が消費する。
//! embedding（ベクトル）はここでは持たず、text + metadata のみ。

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// JSONL 1 行に相当するベクトル化対象レコード。
///
/// TS: `{ id: string, text: string, metadata: Record<string, any> }`。
/// `metadata` のキー順序は TS（挿入順）と厳密一致を保証しない（意味論的同等）。
/// 数値項目は `f64`/`i64` として直列化（TS `parseInt` 結果に一致）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct VectorRecord {
    pub id: String,
    pub text: String,
    pub metadata: Value,
}

/// `search_table` のクエリ入力（TS `string | number[]`、design.md §8.4 `QueryInput`）。
///
/// 文字列は embedding 生成（`vector-search` feature の `embeddings` モジュール）を経由し、
/// ベクトルはそのまま lancedb `vectorSearch` に渡す。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum QueryInput {
    Text(String),
    Vector(Vec<f32>),
}

impl From<&str> for QueryInput {
    fn from(s: &str) -> Self {
        QueryInput::Text(s.to_string())
    }
}

impl From<String> for QueryInput {
    fn from(s: String) -> Self {
        QueryInput::Text(s)
    }
}

impl From<Vec<f32>> for QueryInput {
    fn from(v: Vec<f32>) -> Self {
        QueryInput::Vector(v)
    }
}

/// LanceDB 距離指標（TS `'l2' | 'cosine' | 'dot'`）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DistanceType {
    L2,
    #[default]
    Cosine,
    Dot,
}

/// `filter` の1条件値（TS `string | number | boolean | { min?, max? }`）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum FilterValue {
    Str(String),
    Number(f64),
    Bool(bool),
    Range {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        min: Option<f64>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        max: Option<f64>,
    },
}

/// `exclude` オプション（TS `VectorSearchOptions['exclude']`）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExcludeOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub faq_ids: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub categories: Option<Vec<String>>,
}

/// `search_table`/`vector_search_*` の共通オプション（TS `VectorSearchOptions`）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VectorSearchOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub distance_type: Option<DistanceType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub threshold: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filter: Option<BTreeMap<String, FilterValue>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exclude: Option<ExcludeOptions>,
}

/// vector 検索1件の結果（TS `SearchResult`）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub text: String,
    pub metadata: Value,
    pub score: f32,
}

/// `vector_search_all` の戻り値（TS `Record<string, SearchResult[]>`）。
/// table 名 → 検索結果（0件のテーブルは含まない、TS と同様）。
pub type VectorSearchAllResult = BTreeMap<String, Vec<SearchResult>>;
