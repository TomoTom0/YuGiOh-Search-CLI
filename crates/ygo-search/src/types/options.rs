//! TS 公開面の Options 型群。各 lib に分散定義されている検索・抽出・変換パラメータを再現。

use serde::{Deserialize, Serialize};

/// 名前一致モード（`'exact' | 'partial'`）。部分一致は `name` フィールドのみ。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchMode {
    Exact,
    Partial,
}

/// フォーマット種別（`src/lib/format-converter.ts` の `Format`）
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Json,
    Jsonl,
    Jsonc,
    Yaml,
}

/// `searchCards` パラメータ（`src/lib/card-search-core.ts`）。
///
/// `filter` は任意カラムをキーに持つ動的条件（TS `Record<string, any>`）。
/// 汎用フィルタエンジンの実装は M2-T2。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardSearchParams {
    pub filter: serde_json::Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cols: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<SearchMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_ruby: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flag_auto_modify: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flag_allow_wild: Option<bool>,
}

/// `searchFAQ` パラメータ（`src/search-faq.ts`）
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFAQParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub faq_id: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card_id: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub card_filter: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub question: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answer: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub flag_allow_wild: Option<bool>,
}

/// `extractCardPatterns` パラメータ（`src/utils/pattern-extractor.ts`）
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_start_index: Option<bool>,
}

/// `judgeAndReplace` パラメータ（`src/lib/judge-and-replace.ts`）
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgeAndReplaceOptions {
    /// `true` で《公式名》形式、`false`（既定）で `{{name|cardId}}` 形式
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mount_par: Option<bool>,
}

/// `seekCards` パラメータ（`src/lib/seek-cards.ts`）
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeekCardsOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub random: Option<bool>,
    /// `[start, end]` の cardId 範囲
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub range: Option<[u32; 2]>,
    /// 範囲内の全カード取得（`max` 無視・`range` と併用）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub all: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cols: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub col_all: Option<bool>,
}

/// `convertGenericToJsonl` パラメータ（`src/lib/vector/converter.ts`）。
///
/// `exclude_columns` / `include_columns` は排他（両方指定はエラー）。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenericConversionOptions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub exclude_columns: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub include_columns: Option<Vec<String>>,
}
