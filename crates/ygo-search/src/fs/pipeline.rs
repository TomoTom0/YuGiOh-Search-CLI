//! パターン系パイプライン（TS `extract-and-search-cards.ts` / `judge-and-replace.ts` の Rust 移植）。
//!
//! 公開 API:
//! - [`extract_card_patterns`]: テキストから `{{name|id}}` / 《name》 / `{name}` を抽出（純粋）。
//! - [`extract_and_search_cards`]: 抽出 → fs 検索 → `Vec<CardMatch>`。
//! - [`judge_and_replace`]: 抽出 → fs 検索 → 正規化形式へ置換（`ReplacementResult`）。
//!
//! 抽出ロジックは [`crate::normalize::PatternExtractor`]（Layer A 純粋）に委譲し、
//! 公開の serde 型（[`crate::types`]）へ橋渡しする。検索は [`super::filter`] 経由。
//!
//! # 備考
//! 既存の [`crate::normalize::PatternReplacer`] は workers crate が使用する in-memory 版
//! （英語警告・`MockCard`）。本モジュールは fs 経由で実データを検索し、TS `judgeAndReplace`
//! の日本語警告・serde 型に忠実な出力を生成する。両者はレイヤが異なり、アルゴリズム構造が
//! 重複する点は技術負債として `docs/dev/feature/` に記録。

use std::collections::{HashMap, HashSet};

use serde_json::json;

use crate::normalize::{PatternExtractor, PatternType as NormPatternType};
use crate::types::options::{CardSearchParams, ExtractOptions, JudgeAndReplaceOptions};
use crate::types::{
    Card, CardMatch, ExtractedPattern, PatternType, ProcessedPattern, ReplacementResult,
    ReplacementStatus,
};

use super::filter::filter_cards;
use super::{load_cards, FsError};

// =============================================================================
// 型変換ヘルパ
// =============================================================================

/// 内部 [`NormPatternType`] → 公開 [`PatternType`]。
fn to_pub_type(t: &NormPatternType) -> PatternType {
    match t {
        NormPatternType::CardId => PatternType::CardId,
        NormPatternType::Exact => PatternType::Exact,
        NormPatternType::Flexible => PatternType::Flexible,
    }
}

/// dedup / resultMap 用の安定キー（TS `` `${type}::${query}` `` 互換）。
fn type_query_key(t: &NormPatternType, query: &str) -> String {
    let tstr = match t {
        NormPatternType::CardId => "cardId",
        NormPatternType::Exact => "exact",
        NormPatternType::Flexible => "flexible",
    };
    format!("{tstr}::{query}")
}

// =============================================================================
// extract_card_patterns
// =============================================================================

/// `extractCardPatterns(text, opts) -> ExtractedPattern[]`（TS `pattern-extractor.ts`）。
///
/// 抽出は [`PatternExtractor::extract`] に委譲。`include_start_index` で開始位置を付与する。
/// 優先順位: `cardId` > `exact` > `flexible`（TS と同様）。
pub fn extract_card_patterns(text: &str, opts: &ExtractOptions) -> Vec<ExtractedPattern> {
    let include = opts.include_start_index.unwrap_or(false);
    PatternExtractor::new()
        .extract(text, include)
        .into_iter()
        .map(|p| ExtractedPattern {
            pattern: p.pattern,
            r#type: to_pub_type(&p.pattern_type),
            query: p.query,
            start_index: p.start_index.map(|i| i as i64),
            original_name: p.original_name,
        })
        .collect()
}

// =============================================================================
// 検索ヘルパ
// =============================================================================

/// 1 パターンを [`filter_cards`] で検索する。
///
/// `cardId` → `cardId` 列、それ以外 → `name` 列。
/// `flexible` は wildcard 許可、`exact` は wildcard 禁止（いずれも autoModify=on）。
/// `cardId` は TS 同様に既定（`flagAllowWild`/`flagAutoModify` = true）。
fn search_pattern(cards: &[Card], ptype: &NormPatternType, query: &str) -> Vec<Card> {
    let filter = match ptype {
        NormPatternType::CardId => json!({ "cardId": query }),
        _ => json!({ "name": query }),
    };
    let (flag_allow_wild, flag_auto_modify) = match ptype {
        NormPatternType::Flexible => (Some(true), Some(true)),
        NormPatternType::Exact => (Some(false), Some(true)),
        NormPatternType::CardId => (None, None),
    };
    let params = CardSearchParams {
        filter,
        flag_allow_wild,
        flag_auto_modify,
        ..Default::default()
    };
    filter_cards(cards, &params)
}

// =============================================================================
// extract_and_search_cards
// =============================================================================

/// `extractAndSearchCards(text) -> CardMatch[]`（TS `extract-and-search-cards.ts`）。
///
/// パターンを抽出し、各パターンを fs 検索して [`CardMatch`] にまとめる。
/// TS の try/catch 相当の安全弁として、検索は `filter_cards`（純粋・パニックしない）経由。
pub fn extract_and_search_cards(text: &str) -> Result<Vec<CardMatch>, FsError> {
    let patterns = PatternExtractor::new().extract(text, false);
    if patterns.is_empty() {
        return Ok(Vec::new());
    }
    let cards = load_cards()?;
    let out = patterns
        .into_iter()
        .map(|p| {
            let results = search_pattern(&cards, &p.pattern_type, &p.query);
            CardMatch {
                pattern: p.pattern,
                r#type: to_pub_type(&p.pattern_type),
                query: p.query,
                results,
            }
        })
        .collect();
    Ok(out)
}

// =============================================================================
// judge_and_replace
// =============================================================================

/// `{{name|id}}` 形式（`{{` / `}}` はリテラルの二重波括弧）。
fn fmt_ref(name: &str, id: &str) -> String {
    format!("{{{{{}|{}}}}}", name, id)
}

/// 複数候補 `` {{`query`_`n1|id1`_`n2|id2`}} `` 形式。
fn fmt_multiple(query: &str, candidates: &str) -> String {
    format!("{{{{`{}`_{}}}}}", query, candidates)
}

/// 未発見 `` {{NOTFOUND_`query`}} `` 形式。
fn fmt_notfound(query: &str) -> String {
    format!("{{{{NOTFOUND_`{}`}}}}", query)
}

/// 検索結果付きパターン（置換処理用）。
struct WithResults {
    pattern: String,
    ptype: NormPatternType,
    query: String,
    results: Vec<Card>,
    start_index: usize,
    original_name: Option<String>,
}

/// `judgeAndReplace(text, opts) -> ReplacementResult`（TS `judge-and-replace.ts`）。
///
/// 1. パターン抽出（開始位置付き）
/// 2. `type::query` で dedup → 一括検索（`uniquePatternMap` 相当）
/// 3. 開始位置降順で置換（後方から splice し前方 index を保持）
/// 4. 状態・警告・`hasUnprocessed` を構築
///
/// `mount_par=true` で《公式名》形式、`false`（既定）で `{{name|cardId}}` 形式。
pub fn judge_and_replace(
    text: &str,
    opts: &JudgeAndReplaceOptions,
) -> Result<ReplacementResult, FsError> {
    let mount_par = opts.mount_par.unwrap_or(false);

    let patterns = PatternExtractor::new().extract(text, true);
    if patterns.is_empty() {
        return Ok(ReplacementResult {
            processed_text: text.to_string(),
            has_unprocessed: false,
            warnings: Vec::new(),
            processed_patterns: Vec::new(),
        });
    }

    let cards = load_cards()?;

    // --- dedup by type::query（最初の出現を保持）→ 一括検索 ---
    let mut result_map: HashMap<String, Vec<Card>> = HashMap::new();
    {
        let mut seen: HashSet<String> = HashSet::new();
        for p in &patterns {
            let key = type_query_key(&p.pattern_type, &p.query);
            if seen.insert(key.clone()) {
                let results = search_pattern(&cards, &p.pattern_type, &p.query);
                result_map.insert(key, results);
            }
        }
    }

    // --- 検索結果を割り当て、開始位置降順へソート ---
    let mut with_results: Vec<WithResults> = patterns
        .iter()
        .map(|p| {
            let key = type_query_key(&p.pattern_type, &p.query);
            WithResults {
                results: result_map.get(&key).cloned().unwrap_or_default(),
                pattern: p.pattern.clone(),
                ptype: p.pattern_type.clone(),
                query: p.query.clone(),
                start_index: p.start_index.unwrap_or(0),
                original_name: p.original_name.clone(),
            }
        })
        .collect();
    with_results.sort_by_key(|m| std::cmp::Reverse(m.start_index));

    let mut processed_text = text.to_string();
    let mut has_unprocessed = false;
    let mut warnings: Vec<String> = Vec::new();
    let mut processed_patterns: Vec<ProcessedPattern> = Vec::new();
    let mut processed_keys: HashSet<String> = HashSet::new();

    for m in with_results {
        let count = m.results.len();
        let end = m.start_index + m.pattern.len();

        if m.ptype == NormPatternType::CardId {
            let mut replacement = m.pattern.clone();
            let mut status = ReplacementStatus::AlreadyProcessed;
            let mut warning: Option<String> = None;

            if count == 1 {
                let card = &m.results[0];
                let provided = m.original_name.clone().unwrap_or_default();
                if card.name != provided {
                    status = ReplacementStatus::Corrected;
                    replacement = if mount_par {
                        format!("《{}》", card.name)
                    } else {
                        fmt_ref(&card.name, &card.card_id)
                    };
                    warning = Some(format!(
                        "カード名を修正: \"{}\" → \"{}\" (cardId: {})",
                        provided, card.name, card.card_id
                    ));
                    processed_text.replace_range(m.start_index..end, &replacement);
                }
            } else if count == 0 {
                warning = Some(format!("cardId \"{}\" が見つかりません", m.query));
            } else {
                warning = Some(format!(
                    "cardId \"{}\" で複数のカードが見つかりました。データを確認してください。",
                    m.query
                ));
            }

            let key = format!("{}::{}", m.pattern, replacement);
            if processed_keys.insert(key) {
                processed_patterns.push(ProcessedPattern {
                    original: m.pattern.clone(),
                    replaced: replacement,
                    status,
                });
                if let Some(w) = warning {
                    warnings.push(w);
                }
            }
            continue;
        }

        // --- non-cardId（exact / flexible）---
        if count == 1 {
            let card = &m.results[0];
            let replacement = if mount_par {
                format!("《{}》", card.name)
            } else {
                fmt_ref(&card.name, &card.card_id)
            };
            processed_text.replace_range(m.start_index..end, &replacement);
            let key = format!("{}::{}", m.pattern, replacement);
            if processed_keys.insert(key) {
                processed_patterns.push(ProcessedPattern {
                    original: m.pattern,
                    replaced: replacement,
                    status: ReplacementStatus::Resolved,
                });
            }
        } else if count > 1 {
            let candidates = m
                .results
                .iter()
                .map(|c| format!("`{}|{}`", c.name, c.card_id))
                .collect::<Vec<_>>()
                .join("_");
            let replacement = fmt_multiple(&m.query, &candidates);
            processed_text.replace_range(m.start_index..end, &replacement);
            let key = format!("{}::{}", m.pattern, replacement);
            if processed_keys.insert(key) {
                processed_patterns.push(ProcessedPattern {
                    original: m.pattern,
                    replaced: replacement,
                    status: ReplacementStatus::Multiple,
                });
            }
            has_unprocessed = true;
        } else {
            let replacement = fmt_notfound(&m.query);
            processed_text.replace_range(m.start_index..end, &replacement);
            let key = format!("{}::{}", m.pattern, replacement);
            if processed_keys.insert(key) {
                processed_patterns.push(ProcessedPattern {
                    original: m.pattern,
                    replaced: replacement,
                    status: ReplacementStatus::NotFound,
                });
            }
            has_unprocessed = true;
        }
    }

    if has_unprocessed {
        warnings.push(
            "Text contains unprocessed patterns that require manual review".to_string(),
        );
        let notfound_count = processed_patterns
            .iter()
            .filter(|p| p.status == ReplacementStatus::NotFound)
            .count();
        let multiple_count = processed_patterns
            .iter()
            .filter(|p| p.status == ReplacementStatus::Multiple)
            .count();
        if notfound_count > 0 {
            warnings.push(format!(
                "Found {notfound_count} pattern(s) with no matches (NOTFOUND_*)"
            ));
        }
        if multiple_count > 0 {
            warnings.push(format!(
                "Found {multiple_count} pattern(s) with multiple matches - please select correct one"
            ));
        }
    }

    Ok(ReplacementResult {
        processed_text,
        has_unprocessed,
        warnings,
        processed_patterns,
    })
}
