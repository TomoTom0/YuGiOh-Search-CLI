use super::types::Card;
use crate::normalize::normalize_for_search;

/// カード検索器
pub struct CardSearcher;

impl CardSearcher {
    /// 名前でカードを検索する
    ///
    /// # Arguments
    /// * `cards` - 検索対象のカードリスト
    /// * `query` - 検索クエリ
    ///
    /// # Returns
    /// マッチしたカードのリスト（完全一致→部分一致の順）
    pub fn search_by_name<'a>(cards: &'a [Card], query: &str) -> Vec<&'a Card> {
        if query.is_empty() {
            return Vec::new();
        }

        let normalized_query = normalize_for_search(query);
        let mut exact_matches = Vec::new();
        let mut fuzzy_matches = Vec::new();

        // ワイルドカード検索の場合
        if normalized_query.contains('*') {
            // TypeScript版と同じロジック: *で分割、各部分をエスケープ、.*で結合
            let parts: Vec<&str> = normalized_query.split('*').collect();
            let escaped_parts: Vec<String> = parts
                .iter()
                .map(|part| regex::escape(part))
                .collect();
            let pattern = escaped_parts.join(".*");

            let re = regex::Regex::new(&format!("^{}$", pattern))
                .unwrap_or_else(|_| regex::Regex::new("^$").unwrap());

            for card in cards {
                if re.is_match(&card.normalized_name) {
                    fuzzy_matches.push(card);
                }
            }
            return fuzzy_matches;
        }

        // 通常の検索
        for card in cards {
            if card.normalized_name == normalized_query {
                exact_matches.push(card);
            } else if card.normalized_name.contains(&normalized_query) {
                fuzzy_matches.push(card);
            }
        }

        // 完全一致を優先
        exact_matches.extend(fuzzy_matches);
        exact_matches
    }

    /// カードIDでカードを検索する
    ///
    /// # Arguments
    /// * `cards` - 検索対象のカードリスト
    /// * `card_id` - カードID
    ///
    /// # Returns
    /// マッチしたカード（存在する場合）
    pub fn search_by_id<'a>(cards: &'a [Card], card_id: &str) -> Option<&'a Card> {
        cards.iter().find(|card| card.card_id == card_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // モックカードデータ
    fn mock_cards() -> Vec<Card> {
        vec![
            Card::new("4007", "青眼の白龍", "青眼ノ白龍"),
            Card::new("10000", "青眼の亜白龍", "青眼ノ亜白龍"),
            Card::new("2129", "青眼の究極竜", "青眼ノ究極龍"),
            Card::new("5678", "ブラック・マジシャン", "ブラックマジシャン"),
            Card::new("9012", "E・HERO フレイム・ウィングマン", "eheroフレイムウィングマン"),
        ]
    }

    #[test]
    fn test_search_by_name_exact_match() {
        let cards = mock_cards();
        let results = CardSearcher::search_by_name(&cards, "青眼の白龍");

        assert_eq!(results.len(), 1);
        assert_eq!(results[0].card_id, "4007");
        assert_eq!(results[0].name, "青眼の白龍");
    }

    #[test]
    fn test_search_by_name_fuzzy_match() {
        let cards = mock_cards();
        let results = CardSearcher::search_by_name(&cards, "青眼");

        // "青眼" を含むカードは3つ
        assert_eq!(results.len(), 3);

        // 完全一致はないので、部分一致のみ
        let names: Vec<&str> = results.iter().map(|c| c.name.as_str()).collect();
        assert!(names.contains(&"青眼の白龍"));
        assert!(names.contains(&"青眼の亜白龍"));
        assert!(names.contains(&"青眼の究極竜"));
    }

    #[test]
    fn test_search_by_name_with_normalization() {
        let cards = mock_cards();

        // 全角で検索しても半角に正規化されて見つかる
        let results = CardSearcher::search_by_name(&cards, "Ｅ・ＨＥＲＯ");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].card_id, "9012");

        // ひらがなで検索してもカタカナに正規化されて見つかる
        let results = CardSearcher::search_by_name(&cards, "ぶらっく");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].card_id, "5678");
    }

    #[test]
    fn test_search_by_name_wildcard() {
        let cards = mock_cards();

        // ワイルドカード検索: "青眼*" は "青眼" で始まるカード
        let results = CardSearcher::search_by_name(&cards, "青眼*");
        assert_eq!(results.len(), 3);
    }

    #[test]
    fn test_search_by_name_not_found() {
        let cards = mock_cards();
        let results = CardSearcher::search_by_name(&cards, "存在しないカード");
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_search_by_name_empty_query() {
        let cards = mock_cards();
        let results = CardSearcher::search_by_name(&cards, "");
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_search_by_id_found() {
        let cards = mock_cards();
        let result = CardSearcher::search_by_id(&cards, "4007");

        assert!(result.is_some());
        let card = result.unwrap();
        assert_eq!(card.name, "青眼の白龍");
    }

    #[test]
    fn test_search_by_id_not_found() {
        let cards = mock_cards();
        let result = CardSearcher::search_by_id(&cards, "99999");
        assert!(result.is_none());
    }

    #[test]
    fn test_search_prioritizes_exact_match() {
        // 完全一致が部分一致より優先されることを確認
        let cards = vec![
            Card::new("1", "青眼", "青眼"),
            Card::new("2", "青眼の白龍", "青眼ノ白龍"),
            Card::new("3", "青眼の亜白龍", "青眼ノ亜白龍"),
        ];

        let results = CardSearcher::search_by_name(&cards, "青眼");

        // 完全一致が最初に来る
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].card_id, "1");
    }
}
