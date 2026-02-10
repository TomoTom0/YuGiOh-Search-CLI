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

    // ワイルドカード検索の処理（ts-cliと同じロジック）
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
        // 完全一致のみ（ts-cliと同じ）
        (
            "SELECT card_id, name, normalized_name, card_type, attribute, level, atk, def, description
             FROM cards
             WHERE normalized_name = ?
             LIMIT ?",
            false
        )
    };

    let stmt = if is_wildcard {
        db.prepare(sql)
            .bind(&[normalized_query.into(), (limit as i32).into()])?
    } else {
        db.prepare(sql)
            .bind(&[normalized_query.into(), (limit as i32).into()])?
    };

    let results = stmt.all().await?;
    results.results::<CardInfo>()?.into_iter().collect()
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

    Ok(stmt.first::<CardInfo>(None).await?)
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

    // FAQを一括取得
    let faq_list: Vec<(u32, String, String, String)> = rows
        .into_iter()
        .filter_map(|row| {
            let faq_id = row.get("faq_id").and_then(|v| v.as_i64())? as u32;
            let card_id = row.get("card_id")?.as_str()?.to_string();
            let question = row.get("question")?.as_str()?.to_string();
            let answer = row.get("answer")?.as_str()?.to_string();
            Some((faq_id, card_id, question, answer))
        })
        .collect();

    if faq_list.is_empty() {
        return Ok(vec![]);
    }

    // FAQのIDリストとカードIDリストを抽出
    let faq_ids: Vec<String> = faq_list.iter().map(|(id, _, _, _)| id.to_string()).collect();
    let card_ids: Vec<String> = faq_list.iter().map(|(_, card_id, _, _)| card_id.clone()).collect();

    // カード参照をIN句で一括取得
    let card_refs_map = get_faq_card_references_batch(db, &faq_ids).await?;

    // カード情報をIN句で一括取得
    let card_info_map = search_cards_by_ids(db, &card_ids).await?;

    // マッピング
    let faqs = faq_list
        .into_iter()
        .map(|(faq_id, card_id, question, answer)| {
            let card_references = card_refs_map.get(&faq_id.to_string()).cloned().unwrap_or_default();
            let card_info = card_info_map.get(&card_id).cloned();
            FaqInfo {
                faq_id,
                card_id,
                question,
                answer,
                card_references,
                card_info,
            }
        })
        .collect();

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

    // FAQを一括取得
    let faq_list: Vec<(u32, String, String, String)> = rows
        .into_iter()
        .filter_map(|row| {
            let faq_id = row.get("faq_id").and_then(|v| v.as_i64())? as u32;
            let card_id = row.get("card_id")?.as_str()?.to_string();
            let question = row.get("question")?.as_str()?.to_string();
            let answer = row.get("answer")?.as_str()?.to_string();
            Some((faq_id, card_id, question, answer))
        })
        .collect();

    if faq_list.is_empty() {
        return Ok(vec![]);
    }

    // FAQのIDリストとカードIDリストを抽出
    let faq_ids: Vec<String> = faq_list.iter().map(|(id, _, _, _)| id.to_string()).collect();
    let card_ids: Vec<String> = faq_list.iter().map(|(_, card_id, _, _)| card_id.clone()).collect();

    // カード参照をIN句で一括取得
    let card_refs_map = get_faq_card_references_batch(db, &faq_ids).await?;

    // カード情報をIN句で一括取得
    let card_info_map = search_cards_by_ids(db, &card_ids).await?;

    // マッピング
    let faqs = faq_list
        .into_iter()
        .map(|(faq_id, card_id, question, answer)| {
            let card_references = card_refs_map.get(&faq_id.to_string()).cloned().unwrap_or_default();
            let card_info = card_info_map.get(&card_id).cloned();
            FaqInfo {
                faq_id,
                card_id,
                question,
                answer,
                card_references,
                card_info,
            }
        })
        .collect();

    Ok(faqs)
}

/// FAQのカード参照を取得する
async fn get_faq_card_references(db: &D1Database, faq_id: u32) -> Result<Vec<CardReferenceInfo>> {
    let stmt = db
        .prepare("SELECT card_id, card_name FROM faq_card_references WHERE faq_id = ?")
        .bind(&[(faq_id as i32).into()])?;

    let results = stmt.all().await?;
    results.results::<CardReferenceInfo>()?.into_iter().collect()
}

/// 複数のFAQのカード参照をIN句で一括取得する
async fn get_faq_card_references_batch(db: &D1Database, faq_ids: &[String]) -> Result<std::collections::HashMap<String, Vec<CardReferenceInfo>>> {
    if faq_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let placeholders = faq_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT faq_id, card_id, card_name FROM faq_card_references WHERE faq_id IN ({})",
        placeholders
    );

    let bindings: Vec<worker::Binding> = faq_ids
        .iter()
        .map(|id| id.clone().into())
        .collect();

    let stmt = db.prepare(&sql).bind(&bindings)?;
    let results = stmt.all().await?;
    let rows = results.results::<serde_json::Value>()?;

    let mut map = std::collections::HashMap::new();
    for row in rows {
        if let (Some(faq_id), Some(card_id), Some(card_name)) = (
            row.get("faq_id").and_then(|v| v.as_i64()).map(|v| v.to_string()),
            row.get("card_id").and_then(|v| v.as_str()).map(|s| s.to_string()),
            row.get("card_name").and_then(|v| v.as_str()).map(|s| s.to_string()),
        ) {
            map.entry(faq_id.clone())
                .or_insert_with(Vec::new)
                .push(CardReferenceInfo {
                    name: card_name,
                    card_id,
                });
        }
    }

    Ok(map)
}

/// 複数のカード情報をIN句で一括取得する
async fn search_cards_by_ids(db: &D1Database, card_ids: &[String]) -> Result<std::collections::HashMap<String, CardInfo>> {
    if card_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let placeholders = card_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT card_id, name, normalized_name, card_type, attribute, level, atk, def, description FROM cards WHERE card_id IN ({})",
        placeholders
    );

    let bindings: Vec<worker::Binding> = card_ids
        .iter()
        .map(|id| id.clone().into())
        .collect();

    let stmt = db.prepare(&sql).bind(&bindings)?;
    let results = stmt.all().await?;
    let rows = results.results::<CardInfo>()?;

    let map = rows
        .into_iter()
        .map(|card| (card.card_id.clone(), card))
        .collect();

    Ok(map)
}
