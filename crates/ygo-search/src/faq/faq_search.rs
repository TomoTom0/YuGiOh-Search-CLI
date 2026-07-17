use super::types::{CardReference, FAQRecord};
use crate::normalize::normalize_for_search;
use crate::normalize::PatternExtractor;

/// FAQ検索器
pub struct FAQSearcher;

impl FAQSearcher {
    /// FAQ内からカード参照を抽出する
    ///
    /// # Arguments
    /// * `text` - FAQ本文（question + answer）
    ///
    /// # Returns
    /// 抽出されたカード参照のリスト
    pub fn extract_card_references(text: &str) -> Vec<CardReference> {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract(text, false);

        patterns
            .into_iter()
            .filter_map(|p| {
                if let crate::normalize::PatternType::CardId = p.pattern_type {
                    Some(CardReference {
                        name: p.original_name.unwrap_or_default(),
                        card_id: p.query,
                    })
                } else {
                    None
                }
            })
            .collect()
    }

    /// FAQをテキスト検索する
    ///
    /// # Arguments
    /// * `faqs` - 検索対象のFAQリスト
    /// * `query` - 検索クエリ
    ///
    /// # Returns
    /// マッチしたFAQのリスト
    pub fn search_by_text<'a>(faqs: &'a [FAQRecord], query: &str) -> Vec<&'a FAQRecord> {
        if query.is_empty() {
            return Vec::new();
        }

        let normalized_query = normalize_for_search(query);

        faqs.iter()
            .filter(|faq| {
                faq.normalized_question.contains(&normalized_query)
                    || faq.normalized_answer.contains(&normalized_query)
            })
            .collect()
    }

    /// カードIDでFAQを検索する
    ///
    /// # Arguments
    /// * `faqs` - 検索対象のFAQリスト
    /// * `card_id` - カードID
    ///
    /// # Returns
    /// マッチしたFAQのリスト
    pub fn search_by_card_id<'a>(faqs: &'a [FAQRecord], card_id: &str) -> Vec<&'a FAQRecord> {
        faqs.iter().filter(|faq| faq.card_id == card_id).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // モックFAQデータ
    fn mock_faqs() -> Vec<FAQRecord> {
        vec![
            FAQRecord::new(1, "4007", "青眼の白龍の攻撃力は？", "攻撃力は3000です。"),
            FAQRecord::new(
                2,
                "4007",
                "青眼の白龍を特殊召喚できますか？",
                "できません。このカードは通常召喚でしか召喚できません。",
            ),
            FAQRecord::new(
                3,
                "5678",
                "ブラック・マジシャンの守備力は？",
                "守備力は2500です。",
            ),
            FAQRecord::new(
                4,
                "10000",
                "青眼の亜白龍と青眼の白龍の違いは？",
                "青眼の亜白龍は攻撃力が2500で、青眼の白龍は3000です。",
            )
            .with_card_references(vec![
                CardReference {
                    name: "青眼の亜白龍".to_string(),
                    card_id: "10000".to_string(),
                },
                CardReference {
                    name: "青眼の白龍".to_string(),
                    card_id: "4007".to_string(),
                },
            ]),
        ]
    }

    #[test]
    fn test_extract_card_references_single() {
        let text = "このカードは{{青眼の白龍|4007}}と相性が良いです。";
        let refs = FAQSearcher::extract_card_references(text);

        assert_eq!(refs.len(), 1);
        assert_eq!(refs[0].name, "青眼の白龍");
        assert_eq!(refs[0].card_id, "4007");
    }

    #[test]
    fn test_extract_card_references_multiple() {
        let text = "{{青眼の白龍|4007}}と{{ブラック・マジシャン|5678}}を比較すると...";
        let refs = FAQSearcher::extract_card_references(text);

        assert_eq!(refs.len(), 2);
        assert_eq!(refs[0].name, "青眼の白龍");
        assert_eq!(refs[0].card_id, "4007");
        assert_eq!(refs[1].name, "ブラック・マジシャン");
        assert_eq!(refs[1].card_id, "5678");
    }

    #[test]
    fn test_extract_card_references_none() {
        let text = "カード参照なしのテキストです。";
        let refs = FAQSearcher::extract_card_references(text);
        assert_eq!(refs.len(), 0);
    }

    #[test]
    fn test_search_by_text_question_match() {
        let faqs = mock_faqs();
        let results = FAQSearcher::search_by_text(&faqs, "攻撃力");

        // "攻撃力" を含むFAQは2つ（ID 1と4）
        assert_eq!(results.len(), 2);

        let faq_ids: Vec<u32> = results.iter().map(|f| f.faq_id).collect();
        assert!(faq_ids.contains(&1));
        assert!(faq_ids.contains(&4));
    }

    #[test]
    fn test_search_by_text_answer_match() {
        let faqs = mock_faqs();
        let results = FAQSearcher::search_by_text(&faqs, "守備力");

        // "守備力" を含むFAQは1つ（ID 3）
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].faq_id, 3);
    }

    #[test]
    fn test_search_by_text_with_normalization() {
        let faqs = mock_faqs();

        // ひらがなで検索してもカタカナに正規化されて見つかる
        let results = FAQSearcher::search_by_text(&faqs, "ぶらっく");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].faq_id, 3);
    }

    #[test]
    fn test_search_by_text_not_found() {
        let faqs = mock_faqs();
        let results = FAQSearcher::search_by_text(&faqs, "存在しないテキスト");
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_search_by_card_id_single() {
        let faqs = mock_faqs();
        let results = FAQSearcher::search_by_card_id(&faqs, "4007");

        // cardId "4007" のFAQは2つ
        assert_eq!(results.len(), 2);

        let faq_ids: Vec<u32> = results.iter().map(|f| f.faq_id).collect();
        assert!(faq_ids.contains(&1));
        assert!(faq_ids.contains(&2));
    }

    #[test]
    fn test_search_by_card_id_not_found() {
        let faqs = mock_faqs();
        let results = FAQSearcher::search_by_card_id(&faqs, "99999");
        assert_eq!(results.len(), 0);
    }
}
