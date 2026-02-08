/// 置換ステータス
#[derive(Debug, Clone, PartialEq)]
pub enum ReplacementStatus {
    Resolved,
    Multiple,
    NotFound,
    Corrected,
    AlreadyProcessed,
}

/// 処理されたパターン情報
#[derive(Debug, Clone)]
pub struct ProcessedPattern {
    pub original: String,
    pub replaced: String,
    pub status: ReplacementStatus,
}

/// 置換結果
#[derive(Debug, Clone)]
pub struct ReplacementResult {
    pub processed_text: String,
    pub has_unprocessed: bool,
    pub warnings: Vec<String>,
    pub processed_patterns: Vec<ProcessedPattern>,
}

/// モックカード（テスト用）
#[derive(Debug, Clone)]
pub struct MockCard {
    pub card_id: String,
    pub name: String,
}

/// パターン置換器
pub struct PatternReplacer;

impl PatternReplacer {
    /// パターンを置換する
    ///
    /// # Arguments
    /// * `text` - 置換対象のテキスト
    /// * `patterns` - 抽出されたパターンのリスト
    /// * `search_results` - 各パターンの検索結果
    /// * `mount_par` - 《name》形式で置換するか
    pub fn replace(
        text: &str,
        patterns: Vec<super::pattern::ExtractedPattern>,
        search_results: Vec<Vec<MockCard>>,
        mount_par: bool,
    ) -> ReplacementResult {
        use super::pattern::PatternType;

        if patterns.is_empty() {
            return ReplacementResult {
                processed_text: text.to_string(),
                has_unprocessed: false,
                warnings: Vec::new(),
                processed_patterns: Vec::new(),
            };
        }

        let mut processed_text = text.to_string();
        let mut processed_patterns = Vec::new();
        let mut has_unprocessed = false;

        // パターンと検索結果をペアにして逆順でソート
        let mut pairs: Vec<_> = patterns.into_iter().zip(search_results.into_iter()).collect();
        pairs.sort_by_key(|(p, _)| std::cmp::Reverse(p.start_index.unwrap_or(0)));

        // Track processed patterns to avoid duplicates (same as ts-cli)
        let mut processed_pattern_keys = std::collections::HashSet::new();

        for (pattern, results) in &pairs {
            let start = pattern.start_index.unwrap_or(0);
            let end = start + pattern.pattern.len();

            match &pattern.pattern_type {
                PatternType::CardId => {
                    // CardIDパターンの特殊処理
                    if results.len() == 1 {
                        let card = &results[0];
                        let provided_name = pattern.original_name.as_deref().unwrap_or("");

                        if card.name != provided_name {
                            // 名前が不一致 → 修正
                            let replacement = if mount_par {
                                format!("《{}》", card.name)
                            } else {
                                format!("{{{{{}|{}}}}}", card.name, card.card_id)
                            };

                            processed_text.replace_range(start..end, &replacement);

                            // 重複チェック（ts-cliと同じ）
                            let key = format!("{}::{}", pattern.pattern, replacement);
                            if processed_pattern_keys.insert(key) {
                                processed_patterns.push(ProcessedPattern {
                                    original: pattern.pattern.clone(),
                                    replaced: replacement,
                                    status: ReplacementStatus::Corrected,
                                });
                            }
                        } else {
                            // 名前が一致 → already_processed
                            let key = format!("{}::{}", pattern.pattern, pattern.pattern);
                            if processed_pattern_keys.insert(key) {
                                processed_patterns.push(ProcessedPattern {
                                    original: pattern.pattern.clone(),
                                    replaced: pattern.pattern.clone(),
                                    status: ReplacementStatus::AlreadyProcessed,
                                });
                            }
                        }
                    } else if results.is_empty() {
                        // 結果が0件 → 警告のみ（TypeScript版に合わせる）
                        // processed_patternsには追加しない
                    } else {
                        // 結果が複数件 → 警告のみ（TypeScript版に合わせる）
                        // processed_patternsには追加しない
                    }
                }
                _ => {
                    // 通常のパターン処理
                    if results.len() == 1 {
                        // Resolved
                        let card = &results[0];
                        let replacement = if mount_par {
                            format!("《{}》", card.name)
                        } else {
                            format!("{{{{{}|{}}}}}", card.name, card.card_id)
                        };

                        processed_text.replace_range(start..end, &replacement);

                        // 重複チェック（ts-cliと同じ）
                        let key = format!("{}::{}", pattern.pattern, replacement);
                        if processed_pattern_keys.insert(key) {
                            processed_patterns.push(ProcessedPattern {
                                original: pattern.pattern.clone(),
                                replaced: replacement,
                                status: ReplacementStatus::Resolved,
                            });
                        }
                    } else if results.len() > 1 {
                        // Multiple
                        let candidates: Vec<String> = results
                            .iter()
                            .map(|c| format!("`{}|{}`", c.name, c.card_id))
                            .collect();

                        let replacement = format!("{{{{`{}`_{}}}}}", pattern.query, candidates.join("_"));

                        processed_text.replace_range(start..end, &replacement);

                        // 重複チェック（ts-cliと同じ）
                        let key = format!("{}::{}", pattern.pattern, replacement);
                        if processed_pattern_keys.insert(key) {
                            processed_patterns.push(ProcessedPattern {
                                original: pattern.pattern.clone(),
                                replaced: replacement,
                                status: ReplacementStatus::Multiple,
                            });
                        }

                        has_unprocessed = true;
                    } else {
                        // NotFound
                        let replacement = format!("{{{{NOTFOUND_`{}`}}}}", pattern.query);

                        processed_text.replace_range(start..end, &replacement);

                        // 重複チェック（ts-cliと同じ）
                        let key = format!("{}::{}", pattern.pattern, replacement);
                        if processed_pattern_keys.insert(key) {
                            processed_patterns.push(ProcessedPattern {
                                original: pattern.pattern.clone(),
                                replaced: replacement,
                                status: ReplacementStatus::NotFound,
                            });
                        }

                        has_unprocessed = true;
                    }
                }
            }
        }

        // 警告生成
        let mut warnings = Vec::new();

        // CardIdパターンのエラー警告（TypeScript版に合わせる）
        for (pattern, results) in &pairs {
            if let PatternType::CardId = &pattern.pattern_type {
                if results.is_empty() {
                    warnings.push(format!("cardId \"{}\" not found", pattern.query));
                } else if results.len() > 1 {
                    warnings.push(format!("cardId \"{}\" found multiple cards. Please check data.", pattern.query));
                }
            }
        }

        // Corrected警告
        for pp in &processed_patterns {
            if pp.status == ReplacementStatus::Corrected {
                // CardIdパターンから元の名前とcardIdを抽出
                if let Some(original_pattern) = pairs.iter().find(|(p, _)| p.pattern == pp.original) {
                    if let (Some(provided_name), Some(card)) = (
                        &original_pattern.0.original_name,
                        pairs.iter()
                            .find(|(p, _)| p.pattern == pp.original)
                            .and_then(|(_, results)| results.first())
                    ) {
                        warnings.push(format!(
                            "Card name corrected: \"{}\" → \"{}\" (cardId: {})",
                            provided_name, card.name, card.card_id
                        ));
                    }
                }
            }
        }

        if has_unprocessed {
            warnings.insert(0, "⚠️ Text contains unprocessed patterns that require manual review".to_string());

            let notfound_count = processed_patterns.iter()
                .filter(|p| p.status == ReplacementStatus::NotFound)
                .count();
            let multiple_count = processed_patterns.iter()
                .filter(|p| p.status == ReplacementStatus::Multiple)
                .count();

            if notfound_count > 0 {
                warnings.push(format!("Found {} pattern(s) with no matches (NOTFOUND_*)", notfound_count));
            }
            if multiple_count > 0 {
                warnings.push(format!("Found {} pattern(s) with multiple matches - please select correct one", multiple_count));
            }
        }

        ReplacementResult {
            processed_text,
            has_unprocessed,
            warnings,
            processed_patterns,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::normalize::pattern::PatternExtractor;

    // モックデータ
    fn mock_card(card_id: &str, name: &str) -> MockCard {
        MockCard {
            card_id: card_id.to_string(),
            name: name.to_string(),
        }
    }

    #[test]
    fn test_replace_single_match_resolved() {
        let text = "Use 《青眼の白龍》 card";
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract(text, true);

        let search_results = vec![vec![mock_card("4007", "青眼の白龍")]];

        let result = PatternReplacer::replace(text, patterns, search_results, false);

        assert_eq!(result.processed_text, "Use {{青眼の白龍|4007}} card");
        assert!(!result.has_unprocessed);
        assert_eq!(result.warnings.len(), 0);
        assert_eq!(result.processed_patterns.len(), 1);
        assert_eq!(result.processed_patterns[0].status, ReplacementStatus::Resolved);
    }

    #[test]
    fn test_replace_multiple_matches() {
        let text = "Use {ブルーアイズ*} cards";
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract(text, true);

        let search_results = vec![vec![
            mock_card("4007", "青眼の白龍"),
            mock_card("10000", "青眼の亜白龍"),
        ]];

        let result = PatternReplacer::replace(text, patterns, search_results, false);

        assert!(result.processed_text.contains("{{`ブルーアイズ*`_"));
        assert!(result.processed_text.contains("`青眼の白龍|4007`"));
        assert!(result.processed_text.contains("`青眼の亜白龍|10000`"));
        assert!(result.has_unprocessed);
        assert!(result.warnings.len() > 0);
        assert_eq!(result.processed_patterns[0].status, ReplacementStatus::Multiple);
    }

    #[test]
    fn test_replace_not_found() {
        let text = "Use {NonExistentCard12345} here";
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract(text, true);

        let search_results = vec![Vec::new()];

        let result = PatternReplacer::replace(text, patterns, search_results, false);

        assert_eq!(result.processed_text, "Use {{NOTFOUND_`NonExistentCard12345`}} here");
        assert!(result.has_unprocessed);
        assert!(result.warnings.iter().any(|w| w.contains("no matches")));
        assert_eq!(result.processed_patterns[0].status, ReplacementStatus::NotFound);
    }

    #[test]
    fn test_replace_corrected_card_name() {
        let text = "Use {{間違った名前|4007}} card";
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract(text, true);

        let search_results = vec![vec![mock_card("4007", "青眼の白龍")]];

        let result = PatternReplacer::replace(text, patterns, search_results, false);

        assert_eq!(result.processed_text, "Use {{青眼の白龍|4007}} card");
        assert_eq!(result.processed_patterns[0].status, ReplacementStatus::Corrected);
        assert!(result.warnings.iter().any(|w| w.contains("Card name corrected")));
        assert!(result.warnings.iter().any(|w| w.contains("間違った名前") && w.contains("青眼の白龍")));
    }

    #[test]
    fn test_replace_already_processed() {
        let text = "Use {{青眼の白龍|4007}} card";
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract(text, true);

        let search_results = vec![vec![mock_card("4007", "青眼の白龍")]];

        let result = PatternReplacer::replace(text, patterns, search_results, false);

        assert_eq!(result.processed_text, "Use {{青眼の白龍|4007}} card");
        assert!(!result.has_unprocessed);
        assert_eq!(result.warnings.len(), 0);
        assert_eq!(result.processed_patterns[0].status, ReplacementStatus::AlreadyProcessed);
    }

    #[test]
    fn test_replace_with_mount_par() {
        let text = "Use {青眼の白龍}";
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract(text, true);

        let search_results = vec![vec![mock_card("4007", "青眼の白龍")]];

        let result = PatternReplacer::replace(text, patterns, search_results, true);

        assert_eq!(result.processed_text, "Use 《青眼の白龍》");
        assert_eq!(result.processed_patterns[0].status, ReplacementStatus::Resolved);
    }

    #[test]
    fn test_replace_mixed_patterns() {
        let text = "Use {ブルーアイズ*} and 《青眼の白龍》 and {{青眼の究極竜|2129}}";
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract(text, true);

        // patterns の順序は優先順位順：[cardId, exact, flexible]
        // search_resultsも同じ順序で渡す
        let search_results = vec![
            vec![mock_card("2129", "青眼の究極竜")],  // {{青眼の究極竜|2129}}用
            vec![mock_card("4007", "青眼の白龍")],    // 《青眼の白龍》用
            vec![mock_card("4007", "青眼の白龍"), mock_card("10000", "青眼の亜白龍")],  // {ブルーアイズ*}用
        ];

        let result = PatternReplacer::replace(text, patterns, search_results, false);

        assert_eq!(result.processed_patterns.len(), 3);

        // 順序は逆順で処理されるので、テキスト内の後方から
        // 1つ目（逆順なので最後のpattern）: already_processed (cardId)
        let already_proc = result.processed_patterns.iter().find(|p| p.status == ReplacementStatus::AlreadyProcessed);
        assert!(already_proc.is_some());

        // 2つ目: resolved (exact)
        let resolved = result.processed_patterns.iter().find(|p| p.status == ReplacementStatus::Resolved);
        assert!(resolved.is_some());

        // 3つ目: multiple (flexible)
        let multiple = result.processed_patterns.iter().find(|p| p.status == ReplacementStatus::Multiple);
        assert!(multiple.is_some());
    }

    #[test]
    fn test_replace_no_patterns() {
        let text = "Just plain text";
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract(text, true);

        let search_results = Vec::new();

        let result = PatternReplacer::replace(text, patterns, search_results, false);

        assert_eq!(result.processed_text, "Just plain text");
        assert!(!result.has_unprocessed);
        assert_eq!(result.warnings.len(), 0);
        assert_eq!(result.processed_patterns.len(), 0);
    }

    #[test]
    fn test_replace_warnings_for_multiple_and_notfound() {
        let text = "Use {NonExist} and {ブルーアイズ*}";
        let extractor = PatternExtractor::new();
        let patterns = extractor.extract(text, true);

        let search_results = vec![
            Vec::new(),
            vec![mock_card("4007", "青眼の白龍"), mock_card("10000", "青眼の亜白龍")],
        ];

        let result = PatternReplacer::replace(text, patterns, search_results, false);

        assert!(result.has_unprocessed);
        assert!(result.warnings.iter().any(|w| w.contains("no matches")));
        assert!(result.warnings.iter().any(|w| w.contains("multiple matches")));
    }
}
