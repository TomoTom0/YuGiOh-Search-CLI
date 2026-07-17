//! TS 公開面 FAQ 型（`src/types/faq.ts`）に一致する serde DTO。
//!
//! 注意: 既存の `crate::faq::types::FAQRecord` は内部検索用（正規化済みフィールド等を持つ）で、
//! ここの公開 DTO とは別物。本モジュールは TS 公開 API の戻り値形状を再現する。

use serde::{Deserialize, Serialize};

use super::card::Card;

/// FAQ レコードの公開 DTO。
///
/// `faqId` は TS で `number`。なお `Card.cardId` は `string` であり、
/// FAQ 系の `cardId`/`faqId` が `number` となる TS 内の型不一致を忠実に再現する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FAQRecord {
    pub faq_id: u32,
    pub question: String,
    pub answer: String,
    pub updated_at: String,
}

/// FAQ テキスト中のカード参照。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardReference {
    pub card_id: u32,
    pub card_name: String,
    /// `{{name|id}}` 出現位置
    pub position: i64,
}

/// カード情報を展開した FAQ。
/// TS では `extends FAQRecord`。Rust では `#[serde(flatten)]` で展開し同一 JSON 形状を再現。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FAQWithCards {
    #[serde(flatten)]
    pub record: FAQRecord,
    pub question_cards: Vec<Card>,
    pub answer_cards: Vec<Card>,
    pub all_card_ids: Vec<u32>,
}

/// FAQ 検索結果（順位付き）
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FAQSearchResult {
    pub faq: FAQWithCards,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
}

/// FAQ インデックスの正規化済みテキスト要素。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FAQIndexEntry {
    pub question: String,
    pub answer: String,
}

/// FAQ インデックス（`loadFAQIndex` の戻り値）。
///
/// 注意: TS は `Map<number, ...>` ベース。JSON のキーは文字列になるため、
/// `HashMap<u32, _>` は number キーとして綺麗に往復しない（本型は契約テストの往復対象外・
/// 実装は M2 で `BTreeMap`/専用構造等を再検討）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FAQIndex {
    pub by_id: std::collections::BTreeMap<u32, FAQRecord>,
    pub by_card_id: std::collections::BTreeMap<u32, Vec<u32>>,
    pub normalized: std::collections::BTreeMap<u32, FAQIndexEntry>,
}
