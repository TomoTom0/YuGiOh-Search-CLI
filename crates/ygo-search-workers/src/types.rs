use serde::{Deserialize, Serialize};

/// 正規化リクエスト
#[derive(Debug, Deserialize)]
pub struct NormalizeRequest {
    pub text: String,
}

/// 正規化レスポンス
#[derive(Debug, Serialize)]
pub struct NormalizeResponse {
    pub normalized: String,
}

/// パターン抽出リクエスト
#[derive(Debug, Deserialize)]
pub struct ExtractPatternsRequest {
    pub text: String,
    #[serde(default)]
    pub include_start_index: bool,
}

/// パターン抽出レスポンス
#[derive(Debug, Serialize)]
pub struct ExtractPatternsResponse {
    pub patterns: Vec<PatternInfo>,
}

#[derive(Debug, Serialize)]
pub struct PatternInfo {
    pub pattern: String,
    pub pattern_type: String,
    pub query: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_index: Option<usize>,
}

/// パターン置換リクエスト
#[derive(Debug, Deserialize)]
pub struct ReplacePatternsRequest {
    pub text: String,
    #[serde(default)]
    #[serde(rename = "mountPar")]
    pub mount_par: bool,
}

/// パターン置換レスポンス
#[derive(Debug, Serialize)]
pub struct ReplacePatternsResponse {
    #[serde(rename = "processedText")]
    pub processed_text: String,
    #[serde(rename = "hasUnprocessed")]
    pub has_unprocessed: bool,
    pub warnings: Vec<String>,
    #[serde(rename = "processedPatterns")]
    pub processed_patterns: Vec<ProcessedPatternInfo>,
}

#[derive(Debug, Serialize)]
pub struct ProcessedPatternInfo {
    pub original: String,
    pub replaced: String,
    pub status: String,
}

/// カード検索リクエスト
#[derive(Debug, Deserialize)]
pub struct SearchCardsRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card_id: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_limit() -> usize {
    50
}

/// カード検索レスポンス
#[derive(Debug, Serialize)]
pub struct SearchCardsResponse {
    pub cards: Vec<CardInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardInfo {
    pub card_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub normalized_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attribute: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub atk: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub def: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// FAQ検索リクエスト
#[derive(Debug, Deserialize)]
pub struct SearchFaqsRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card_id: Option<String>,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

/// FAQ検索レスポンス
#[derive(Debug, Serialize)]
pub struct SearchFaqsResponse {
    pub faqs: Vec<FaqInfo>,
}

#[derive(Debug, Serialize)]
pub struct FaqInfo {
    pub faq_id: u32,
    pub card_id: String,
    pub question: String,
    pub answer: String,
    pub card_references: Vec<CardReferenceInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card_info: Option<CardInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CardReferenceInfo {
    pub name: String,
    pub card_id: String,
}

/// seek カードレスポンス（TS `seek-cards.ts` の `{data, total}` 形状）。
///
/// data は SELECT 投影 row（D1 row）の直接透過で、key は D1 列名（snake_case）。
/// 選択列のみを持ち、`CardInfo` への逆直列化や空文字既定の補完はしない
/// （TASK-51）。cols/colAll 無指定時は TS 既定の `card_id, name` 投影になる。
#[derive(Debug, Serialize)]
pub struct SeekCardsResponse {
    pub data: Vec<serde_json::Value>,
    pub total: usize,
}

/// convert レスポンス（TS `convert.ts` の `{converted, inputFormat, outputFormat}` 形状）
#[derive(Debug, Serialize)]
pub struct ConvertResponse {
    pub converted: String,
    #[serde(rename = "inputFormat")]
    pub input_format: String,
    #[serde(rename = "outputFormat")]
    pub output_format: String,
}
