use super::types::*;
use crate::normalize::normalize_for_search;
use worker::*;

/// D1からカードを検索する
///
/// # Arguments
/// * `db` - D1データベース
/// * `query` - 検索クエリ（名前で検索）
/// * `limit` - 取得件数上限
pub async fn search_cards_by_name(db: &D1Database, query: &str, limit: usize) -> Result<Vec<CardInfo>> {
    let normalized_query = normalize_for_search(query);

    // ワイルドカード検索の処理
    let (sql, is_wildcard) = if normalized_query.contains('*') {
        let pattern = normalized_query.replace('*', "%");
        (
            "SELECT card_id, name, normalized_name, card_type, attribute, level, atk, def, description
             FROM cards
             WHERE normalized_name LIKE ?
             LIMIT ?",
            true
        )
    } else {
        // 完全一致 + 部分一致
        (
            "SELECT card_id, name, normalized_name, card_type, attribute, level, atk, def, description
             FROM cards
             WHERE normalized_name = ? OR normalized_name LIKE ?
             ORDER BY CASE WHEN normalized_name = ? THEN 0 ELSE 1 END
             LIMIT ?",
            false
        )
    };

    let stmt = if is_wildcard {
        db.prepare(sql)
            .bind(&[normalized_query.into(), (limit as i32).into()])?
    } else {
        let like_pattern = format!("%{}%", normalized_query);
        db.prepare(sql)
            .bind(&[
                normalized_query.clone().into(),
                like_pattern.into(),
                normalized_query.into(),
                (limit as i32).into(),
            ])?
    };

    let results = stmt.all().await?;
    let rows = results.results::<serde_json::Value>()?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            Some(CardInfo {
                card_id: row.get("card_id")?.as_str()?.to_string(),
                name: row.get("name")?.as_str()?.to_string(),
                normalized_name: row.get("normalized_name").and_then(|v| v.as_str()).map(|s| s.to_string()),
                card_type: row.get("card_type").and_then(|v| v.as_str()).map(|s| s.to_string()),
                attribute: row.get("attribute").and_then(|v| v.as_str()).map(|s| s.to_string()),
                level: row.get("level").and_then(|v| v.as_i64()).map(|n| n as i32),
                atk: row.get("atk").and_then(|v| v.as_i64()).map(|n| n as i32),
                def: row.get("def").and_then(|v| v.as_i64()).map(|n| n as i32),
                description: row.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
            })
        })
        .collect())
}

/// D1からカードIDでカードを検索する
///
/// # Arguments
/// * `db` - D1データベース
/// * `card_id` - カードID
pub async fn search_card_by_id(db: &D1Database, card_id: &str) -> Result<Option<CardInfo>> {
    let stmt = db
        .prepare("SELECT card_id, name, normalized_name, card_type, attribute, level, atk, def, description FROM cards WHERE card_id = ?")
        .bind(&[card_id.into()])?;

    let results = stmt.first::<serde_json::Value>(None).await?;

    Ok(results.and_then(|row| {
        Some(CardInfo {
            card_id: row.get("card_id")?.as_str()?.to_string(),
            name: row.get("name")?.as_str()?.to_string(),
            normalized_name: row.get("normalized_name").and_then(|v| v.as_str()).map(|s| s.to_string()),
            card_type: row.get("card_type").and_then(|v| v.as_str()).map(|s| s.to_string()),
            attribute: row.get("attribute").and_then(|v| v.as_str()).map(|s| s.to_string()),
            level: row.get("level").and_then(|v| v.as_i64()).map(|n| n as i32),
            atk: row.get("atk").and_then(|v| v.as_i64()).map(|n| n as i32),
            def: row.get("def").and_then(|v| v.as_i64()).map(|n| n as i32),
            description: row.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
        })
    }))
}

/// D1からFAQをテキスト検索する
///
/// # Arguments
/// * `db` - D1データベース
/// * `query` - 検索クエリ
/// * `limit` - 取得件数上限
pub async fn search_faqs_by_text(db: &D1Database, query: &str, limit: usize) -> Result<Vec<FaqInfo>> {
    let normalized_query = normalize_for_search(query);
    let like_pattern = format!("%{}%", normalized_query);

    let stmt = db
        .prepare(
            "SELECT f.faq_id, f.card_id, f.question, f.answer
             FROM faqs f
             WHERE f.normalized_question LIKE ? OR f.normalized_answer LIKE ?
             LIMIT ?",
        )
        .bind(&[like_pattern.clone().into(), like_pattern.into(), (limit as i32).into()])?;

    let results = stmt.all().await?;
    let rows = results.results::<serde_json::Value>()?;

    let mut faqs = Vec::new();
    for row in rows {
        if let (Some(faq_id), Some(card_id), Some(question), Some(answer)) = (
            row.get("faq_id").and_then(|v| v.as_i64()),
            row.get("card_id").and_then(|v| v.as_str()),
            row.get("question").and_then(|v| v.as_str()),
            row.get("answer").and_then(|v| v.as_str()),
        ) {
            // カード参照を取得
            let card_refs = get_faq_card_references(db, faq_id as u32).await?;

            // カード情報を取得
            let card_info = search_card_by_id(db, card_id).await?;

            faqs.push(FaqInfo {
                faq_id: faq_id as u32,
                card_id: card_id.to_string(),
                question: question.to_string(),
                answer: answer.to_string(),
                card_references: card_refs,
                card_info,
            });
        }
    }

    Ok(faqs)
}

/// D1からカードIDでFAQを検索する
///
/// # Arguments
/// * `db` - D1データベース
/// * `card_id` - カードID
/// * `limit` - 取得件数上限
pub async fn search_faqs_by_card_id(db: &D1Database, card_id: &str, limit: usize) -> Result<Vec<FaqInfo>> {
    let stmt = db
        .prepare(
            "SELECT faq_id, card_id, question, answer
             FROM faqs
             WHERE card_id = ?
             LIMIT ?",
        )
        .bind(&[card_id.into(), (limit as i32).into()])?;

    let results = stmt.all().await?;
    let rows = results.results::<serde_json::Value>()?;

    let mut faqs = Vec::new();
    for row in rows {
        if let (Some(faq_id), Some(card_id), Some(question), Some(answer)) = (
            row.get("faq_id").and_then(|v| v.as_i64()),
            row.get("card_id").and_then(|v| v.as_str()),
            row.get("question").and_then(|v| v.as_str()),
            row.get("answer").and_then(|v| v.as_str()),
        ) {
            // カード参照を取得
            let card_refs = get_faq_card_references(db, faq_id as u32).await?;

            // カード情報を取得
            let card_info = search_card_by_id(db, card_id).await?;

            faqs.push(FaqInfo {
                faq_id: faq_id as u32,
                card_id: card_id.to_string(),
                question: question.to_string(),
                answer: answer.to_string(),
                card_references: card_refs,
                card_info,
            });
        }
    }

    Ok(faqs)
}

/// FAQのカード参照を取得する
async fn get_faq_card_references(db: &D1Database, faq_id: u32) -> Result<Vec<CardReferenceInfo>> {
    let stmt = db
        .prepare("SELECT card_id, card_name FROM faq_card_references WHERE faq_id = ?")
        .bind(&[(faq_id as i32).into()])?;

    let results = stmt.all().await?;
    let rows = results.results::<serde_json::Value>()?;

    Ok(rows
        .into_iter()
        .filter_map(|row| {
            Some(CardReferenceInfo {
                name: row.get("card_name")?.as_str()?.to_string(),
                card_id: row.get("card_id")?.as_str()?.to_string(),
            })
        })
        .collect())
}
