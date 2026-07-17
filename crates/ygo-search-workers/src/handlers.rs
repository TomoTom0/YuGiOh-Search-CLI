use crate::db;
use crate::types::*;
use worker::*;
use ygo_search::normalize::{
    normalize_for_search, MockCard, PatternExtractor, PatternReplacer, PatternType,
    ReplacementStatus,
};

/// テキストを正規化する
pub async fn normalize_text(mut req: Request, _ctx: RouteContext<()>) -> Result<Response> {
    let body: NormalizeRequest = req.json().await?;
    let normalized = normalize_for_search(&body.text);

    Response::from_json(&NormalizeResponse { normalized })
}

/// パターンを抽出する
pub async fn extract_patterns(mut req: Request, _ctx: RouteContext<()>) -> Result<Response> {
    let body: ExtractPatternsRequest = req.json().await?;

    let extractor = PatternExtractor::new();
    let patterns = extractor.extract(&body.text, body.include_start_index);

    let patterns_info: Vec<PatternInfo> = patterns
        .into_iter()
        .map(|p| PatternInfo {
            pattern: p.pattern,
            pattern_type: match p.pattern_type {
                PatternType::CardId => "cardId".to_string(),
                PatternType::Exact => "exact".to_string(),
                PatternType::Flexible => "flexible".to_string(),
            },
            query: p.query,
            original_name: p.original_name,
            start_index: p.start_index,
        })
        .collect();

    Response::from_json(&ExtractPatternsResponse {
        patterns: patterns_info,
    })
}

/// パターンを置換する
pub async fn replace_patterns(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let body: ReplacePatternsRequest = req.json().await?;
    let db = ctx.env.d1("DB")?;

    // パターンを抽出
    let extractor = PatternExtractor::new();
    let patterns = extractor.extract(&body.text, true);

    // パターンの重複を除去（TypeScript版と同じ最適化）
    let mut unique_patterns = Vec::new();
    let mut seen_keys = std::collections::HashSet::new();

    for pattern in &patterns {
        let key = format!(
            "{}::{}",
            match pattern.pattern_type {
                PatternType::CardId => "cardId",
                PatternType::Exact => "exact",
                PatternType::Flexible => "flexible",
            },
            pattern.query
        );

        if !seen_keys.contains(&key) {
            seen_keys.insert(key);
            unique_patterns.push(pattern);
        }
    }

    // 重複除去されたパターンのみを検索
    let mut result_map = std::collections::HashMap::new();

    for pattern in &unique_patterns {
        let key = format!(
            "{}::{}",
            match pattern.pattern_type {
                PatternType::CardId => "cardId",
                PatternType::Exact => "exact",
                PatternType::Flexible => "flexible",
            },
            pattern.query
        );

        let cards = match &pattern.pattern_type {
            PatternType::CardId => {
                // CardIDで検索
                if let Some(card) = db::search_card_by_id(&db, &pattern.query).await? {
                    vec![MockCard {
                        card_id: card.card_id,
                        name: card.name,
                    }]
                } else {
                    vec![]
                }
            }
            _ => {
                // 名前で検索
                let cards = db::search_cards_by_name(&db, &pattern.query, 10).await?;
                cards
                    .into_iter()
                    .map(|c| MockCard {
                        card_id: c.card_id,
                        name: c.name,
                    })
                    .collect()
            }
        };

        result_map.insert(key, cards);
    }

    // 元のパターン順序で検索結果を取得
    let mut search_results = Vec::new();
    for pattern in &patterns {
        let key = format!(
            "{}::{}",
            match pattern.pattern_type {
                PatternType::CardId => "cardId",
                PatternType::Exact => "exact",
                PatternType::Flexible => "flexible",
            },
            pattern.query
        );

        search_results.push(result_map.get(&key).cloned().unwrap_or_default());
    }

    // パターン置換を実行
    let result = PatternReplacer::replace(&body.text, patterns, search_results, body.mount_par);

    // レスポンスを構築
    let processed_patterns: Vec<ProcessedPatternInfo> = result
        .processed_patterns
        .into_iter()
        .map(|p| ProcessedPatternInfo {
            original: p.original,
            replaced: p.replaced,
            status: match p.status {
                ReplacementStatus::Resolved => "resolved".to_string(),
                ReplacementStatus::Multiple => "multiple".to_string(),
                ReplacementStatus::NotFound => "notfound".to_string(),
                ReplacementStatus::Corrected => "corrected".to_string(),
                ReplacementStatus::AlreadyProcessed => "already_processed".to_string(),
            },
        })
        .collect();

    Response::from_json(&ReplacePatternsResponse {
        processed_text: result.processed_text,
        has_unprocessed: result.has_unprocessed,
        warnings: result.warnings,
        processed_patterns,
    })
}

/// カードを検索する
pub async fn search_cards(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let body: SearchCardsRequest = req.json().await?;
    let db = ctx.env.d1("DB")?;

    let cards = if let Some(card_id) = body.card_id {
        // カードIDで検索
        if let Some(card) = db::search_card_by_id(&db, &card_id).await? {
            vec![card]
        } else {
            vec![]
        }
    } else if let Some(query) = body.query {
        // 名前で検索
        db::search_cards_by_name(&db, &query, body.limit).await?
    } else {
        vec![]
    };

    Response::from_json(&SearchCardsResponse { cards })
}

/// FAQを検索する
pub async fn search_faqs(mut req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let body: SearchFaqsRequest = req.json().await?;
    let db = ctx.env.d1("DB")?;

    let faqs = if let Some(card_id) = body.card_id {
        // カードIDで検索
        db::search_faqs_by_card_id(&db, &card_id, body.limit).await?
    } else if let Some(query) = body.query {
        // テキストで検索
        db::search_faqs_by_text(&db, &query, body.limit).await?
    } else {
        vec![]
    };

    Response::from_json(&SearchFaqsResponse { faqs })
}
