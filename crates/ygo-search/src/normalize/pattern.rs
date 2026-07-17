/// パターン種別
#[derive(Debug, Clone, PartialEq)]
pub enum PatternType {
    CardId,
    Exact,
    Flexible,
}

/// 抽出されたパターン
#[derive(Debug, Clone)]
pub struct ExtractedPattern {
    pub pattern: String,
    pub pattern_type: PatternType,
    pub query: String,
    pub original_name: Option<String>,
    pub start_index: Option<usize>,
}

use regex::Regex;
use std::collections::HashSet;

/// パターン抽出器
pub struct PatternExtractor {
    card_id_re: Regex,
    exact_re: Regex,
    flexible_re: Regex,
}

impl Default for PatternExtractor {
    fn default() -> Self {
        Self::new()
    }
}

impl PatternExtractor {
    pub fn new() -> Self {
        Self {
            card_id_re: Regex::new(r"\{\{([^|]+)\|([^}]+)\}\}").unwrap(),
            exact_re: Regex::new(r"《([^》]+)》").unwrap(),
            flexible_re: Regex::new(r"\{([^}]+)\}").unwrap(),
        }
    }

    /// テキストからカードパターンを抽出する
    ///
    /// 優先順位：CardId > Exact > Flexible
    /// ネストしたパターンは除外
    pub fn extract(&self, text: &str, include_start_index: bool) -> Vec<ExtractedPattern> {
        let mut patterns = Vec::new();
        let mut used_positions = HashSet::new();

        // Priority 1: CardID patterns {{name|cardId}}
        for cap in self.card_id_re.captures_iter(text) {
            let m = cap.get(0).unwrap();
            let start = m.start();
            let end = m.end();

            patterns.push(ExtractedPattern {
                pattern: m.as_str().to_string(),
                pattern_type: PatternType::CardId,
                query: cap[2].trim().to_string(),
                original_name: Some(cap[1].trim().to_string()),
                start_index: if include_start_index {
                    Some(start)
                } else {
                    None
                },
            });

            for i in start..end {
                used_positions.insert(i);
            }
        }

        // Priority 2: Exact patterns 《name》
        for cap in self.exact_re.captures_iter(text) {
            let m = cap.get(0).unwrap();
            let start = m.start();

            if used_positions.contains(&start) {
                continue;
            }

            let end = m.end();
            patterns.push(ExtractedPattern {
                pattern: m.as_str().to_string(),
                pattern_type: PatternType::Exact,
                query: cap[1].trim().to_string(),
                original_name: None,
                start_index: if include_start_index {
                    Some(start)
                } else {
                    None
                },
            });

            for i in start..end {
                used_positions.insert(i);
            }
        }

        // Priority 3: Flexible patterns {name}
        for cap in self.flexible_re.captures_iter(text) {
            let m = cap.get(0).unwrap();
            let start = m.start();

            if used_positions.contains(&start) {
                continue;
            }

            let end = m.end();
            patterns.push(ExtractedPattern {
                pattern: m.as_str().to_string(),
                pattern_type: PatternType::Flexible,
                query: cap[1].trim().to_string(),
                original_name: None,
                start_index: if include_start_index {
                    Some(start)
                } else {
                    None
                },
            });

            for i in start..end {
                used_positions.insert(i);
            }
        }

        patterns
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 既存TypeScriptテスト（pattern-extraction.test.ts）から移植

    #[test]
    fn test_extract_flexible() {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract("Use {青眼の白龍} in deck", false);

        assert_eq!(patterns.len(), 1);
        assert_eq!(patterns[0].pattern, "{青眼の白龍}");
        assert_eq!(patterns[0].pattern_type, PatternType::Flexible);
        assert_eq!(patterns[0].query, "青眼の白龍");
    }

    #[test]
    fn test_extract_exact() {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract("Use 《青眼の白龍》 card", false);

        assert_eq!(patterns.len(), 1);
        assert_eq!(patterns[0].pattern, "《青眼の白龍》");
        assert_eq!(patterns[0].pattern_type, PatternType::Exact);
        assert_eq!(patterns[0].query, "青眼の白龍");
    }

    #[test]
    fn test_extract_card_id() {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract("Use {{青眼の白龍|4007}} in combo", false);

        assert_eq!(patterns.len(), 1);
        assert_eq!(patterns[0].pattern, "{{青眼の白龍|4007}}");
        assert_eq!(patterns[0].pattern_type, PatternType::CardId);
        assert_eq!(patterns[0].query, "4007");
        assert_eq!(patterns[0].original_name, Some("青眼の白龍".to_string()));
    }

    #[test]
    fn test_extract_multiple_patterns_in_correct_priority() {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract("Use {flexible} and 《exact》 and {{name|4007}}", false);

        assert_eq!(patterns.len(), 3);
        assert_eq!(patterns[0].pattern_type, PatternType::CardId);
        assert_eq!(patterns[1].pattern_type, PatternType::Exact);
        assert_eq!(patterns[2].pattern_type, PatternType::Flexible);
    }

    #[test]
    fn test_not_extract_nested_patterns() {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract("Use {{name|4007}} not {inside}", false);

        assert_eq!(patterns.len(), 2);
        assert_eq!(patterns[0].pattern_type, PatternType::CardId);
        assert_eq!(patterns[1].pattern_type, PatternType::Flexible);
        // {{...}}の内部の{inside}は抽出されない
    }

    #[test]
    fn test_handle_empty_text() {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract("", false);
        assert_eq!(patterns.len(), 0);
    }

    #[test]
    fn test_handle_text_with_no_patterns() {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract("Just plain text", false);
        assert_eq!(patterns.len(), 0);
    }

    #[test]
    fn test_trim_whitespace_from_queries() {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract("Use { card name } here", false);

        assert_eq!(patterns.len(), 1);
        assert_eq!(patterns[0].query, "card name");
    }

    #[test]
    fn test_handle_wildcard_in_flexible_patterns() {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract("Search {ブルーアイズ*} cards", false);

        assert_eq!(patterns.len(), 1);
        assert_eq!(patterns[0].query, "ブルーアイズ*");
    }

    #[test]
    fn test_handle_multiple_wildcards() {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract("Use {Evil*Twin*} deck", false);

        assert_eq!(patterns.len(), 1);
        assert_eq!(patterns[0].query, "Evil*Twin*");
    }

    #[test]
    fn test_include_start_index() {
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract("Use {card} here", true);

        assert_eq!(patterns.len(), 1);
        assert!(patterns[0].start_index.is_some());
        assert_eq!(patterns[0].start_index.unwrap(), 4);
    }
}
