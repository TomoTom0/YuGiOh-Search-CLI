use crate::types::*;
use worker::d1::D1Database;
use worker::*;
use ygo_search::normalize::normalize_for_search;

/// D1からカードを検索する
///
/// # Arguments
/// * `db` - D1データベース
/// * `query` - 検索クエリ（名前で検索）
/// * `limit` - 取得件数上限
pub async fn search_cards_by_name(
    db: &D1Database,
    query: &str,
    limit: usize,
) -> Result<Vec<CardInfo>> {
    let normalized_query = normalize_for_search(query);

    // ワイルドカード検索の処理（ts-cliと同じロジック）
    // * が含まれる場合は % に置換して LIKE 検索、それ以外は完全一致
    let (sql, bind_query) = if normalized_query.contains('*') {
        (
            "SELECT card_id, name, normalized_name, card_type, attribute, level, atk, def, description
             FROM cards
             WHERE normalized_name LIKE ?
             LIMIT ?",
            normalized_query.replace('*', "%"),
        )
    } else {
        // 完全一致のみ（ts-cliと同じ）
        (
            "SELECT card_id, name, normalized_name, card_type, attribute, level, atk, def, description
             FROM cards
             WHERE normalized_name = ?
             LIMIT ?",
            normalized_query,
        )
    };

    let stmt = db
        .prepare(sql)
        .bind(&[bind_query.into(), (limit as i32).into()])?;
    let results = stmt.all().await?;
    results.results::<CardInfo>()
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

    stmt.first::<CardInfo>(None).await
}

/// D1からFAQをテキスト検索する
///
/// # Arguments
/// * `db` - D1データベース
/// * `query` - 検索クエリ
/// * `limit` - 取得件数上限
pub async fn search_faqs_by_text(
    db: &D1Database,
    query: &str,
    limit: usize,
) -> Result<Vec<FaqInfo>> {
    let normalized_query = normalize_for_search(query);
    let like_pattern = format!("%{}%", normalized_query);

    let stmt = db
        .prepare(
            "SELECT f.faq_id, f.card_id, f.question, f.answer
             FROM faqs f
             WHERE f.normalized_question LIKE ? OR f.normalized_answer LIKE ?
             LIMIT ?",
        )
        .bind(&[
            like_pattern.clone().into(),
            like_pattern.into(),
            (limit as i32).into(),
        ])?;

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
    let faq_ids: Vec<String> = faq_list
        .iter()
        .map(|(id, _, _, _)| id.to_string())
        .collect();
    let card_ids: Vec<String> = faq_list
        .iter()
        .map(|(_, card_id, _, _)| card_id.clone())
        .collect();

    // カード参照をIN句で一括取得
    let card_refs_map = get_faq_card_references_batch(db, &faq_ids).await?;

    // カード情報をIN句で一括取得
    let card_info_map = search_cards_by_ids(db, &card_ids).await?;

    // マッピング
    let faqs = faq_list
        .into_iter()
        .map(|(faq_id, card_id, question, answer)| {
            let card_references = card_refs_map
                .get(&faq_id.to_string())
                .cloned()
                .unwrap_or_default();
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
pub async fn search_faqs_by_card_id(
    db: &D1Database,
    card_id: &str,
    limit: usize,
) -> Result<Vec<FaqInfo>> {
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
    let faq_ids: Vec<String> = faq_list
        .iter()
        .map(|(id, _, _, _)| id.to_string())
        .collect();
    let card_ids: Vec<String> = faq_list
        .iter()
        .map(|(_, card_id, _, _)| card_id.clone())
        .collect();

    // カード参照をIN句で一括取得
    let card_refs_map = get_faq_card_references_batch(db, &faq_ids).await?;

    // カード情報をIN句で一括取得
    let card_info_map = search_cards_by_ids(db, &card_ids).await?;

    // マッピング
    let faqs = faq_list
        .into_iter()
        .map(|(faq_id, card_id, question, answer)| {
            let card_references = card_refs_map
                .get(&faq_id.to_string())
                .cloned()
                .unwrap_or_default();
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

/// 複数のFAQのカード参照をIN句で一括取得する
async fn get_faq_card_references_batch(
    db: &D1Database,
    faq_ids: &[String],
) -> Result<std::collections::HashMap<String, Vec<CardReferenceInfo>>> {
    if faq_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let placeholders = faq_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT faq_id, card_id, card_name FROM faq_card_references WHERE faq_id IN ({})",
        placeholders
    );

    let bindings: Vec<wasm_bindgen::JsValue> = faq_ids.iter().map(|id| id.clone().into()).collect();

    let stmt = db.prepare(&sql).bind(&bindings)?;
    let results = stmt.all().await?;
    let rows = results.results::<serde_json::Value>()?;

    let mut map = std::collections::HashMap::new();
    for row in rows {
        if let (Some(faq_id), Some(card_id), Some(card_name)) = (
            row.get("faq_id")
                .and_then(|v| v.as_i64())
                .map(|v| v.to_string()),
            row.get("card_id")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            row.get("card_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
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
async fn search_cards_by_ids(
    db: &D1Database,
    card_ids: &[String],
) -> Result<std::collections::HashMap<String, CardInfo>> {
    if card_ids.is_empty() {
        return Ok(std::collections::HashMap::new());
    }

    let placeholders = card_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "SELECT card_id, name, normalized_name, card_type, attribute, level, atk, def, description FROM cards WHERE card_id IN ({})",
        placeholders
    );

    let bindings: Vec<wasm_bindgen::JsValue> =
        card_ids.iter().map(|id| id.clone().into()).collect();

    let stmt = db.prepare(&sql).bind(&bindings)?;
    let results = stmt.all().await?;
    let rows = results.results::<CardInfo>()?;

    let map = rows
        .into_iter()
        .map(|card| (card.card_id.clone(), card))
        .collect();

    Ok(map)
}

/// cards テーブルの seek 列投影に許可する列 whitelist（TASK-51）。
/// `sql/schema.sql` の cards 18 列から `created_at` を除いた 17 列（schema 順）。
/// `created_at` を除くのは TS 正本が `mapCardDbToApi` で応答に出さないため
/// （[`SeekSelect::All`] の明示列挙で TS `SELECT *` と選択列集合〔created_at 以外〕を
/// 同一にする。応答 JSON 全体の形状差〔snake_case キー・数値型 atk/def・TS worker の
/// 空文字既定補完なし〕は gap doc §6 の既知残差）。
pub const CARDS_COLUMNS: [&str; 17] = [
    "card_id",
    "name",
    "ruby",
    "normalized_name",
    "normalized_ruby",
    "card_type",
    "attribute",
    "level",
    "atk",
    "def",
    "description",
    "race",
    "monster_types",
    "spell_effect_type",
    "trap_effect_type",
    "link_markers",
    "link_value",
];

/// seek の SELECT 構成（TASK-51）。handler 側 `resolve_seek_select` がクエリパラメータ
/// （`colAll` / `cols`）からこの構成へ解決する。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SeekSelect {
    /// [`CARDS_COLUMNS`] 17 列の明示列挙。TS `colAll` は `SELECT *` だが、`created_at` が
    /// row に入り応答に露出するのを避けるため明示列挙にする（SQL 文面は TS と異なるが
    /// 選択列集合〔created_at 以外〕は同一。応答 JSON 全体の形状差は gap doc §6 の既知残差）
    All,
    /// 投影列（`cols` 指定。`CARDS_COLUMNS` 検証済みの列名のみ入る）
    Columns(Vec<&'static str>),
}

/// seek の SQL 文面を組み立てる純粋関数（native テスト可能）。
/// 分岐・文言は TS `seek-cards.ts` と同一:
/// - `has_range = true`: `WHERE card_id BETWEEN ? AND ?`
/// - `has_range = true` かつ `all = true`: ORDER BY / LIMIT なし（範囲内全件）
/// - `has_range = true` かつ `all = false`: random に応じ `ORDER BY RANDOM()` + `LIMIT ?`
/// - `has_range = false`: random に応じ `ORDER BY RANDOM()` + `LIMIT ?`
pub fn build_seek_sql(select: &SeekSelect, has_range: bool, random: bool, all: bool) -> String {
    let columns: &[&str] = match select {
        SeekSelect::All => &CARDS_COLUMNS,
        SeekSelect::Columns(columns) => columns,
    };
    let mut sql = format!("SELECT {} FROM cards", columns.join(", "));
    if has_range {
        sql.push_str(" WHERE card_id BETWEEN ? AND ?");
        if !all {
            if random {
                sql.push_str(" ORDER BY RANDOM()");
            }
            sql.push_str(" LIMIT ?");
        }
    } else if random {
        sql.push_str(" ORDER BY RANDOM() LIMIT ?");
    } else {
        sql.push_str(" LIMIT ?");
    }
    sql
}

/// D1 の cards テーブルから seek（ランダム/範囲/先頭 N 件）でカードを取得する。
/// TASK-51 で `cols` / `colAll` 列投影に対応した。
///
/// - `select`: SELECT 列構成（[`SeekSelect`]）。戻り値は D1 row を逆直列化せず
///   `serde_json::Value` のまま直接透過する（key は D1 列名＝snake_case。
///   投影 row は選択列のみを持つ）
/// - `range` 両端指定: `WHERE card_id BETWEEN ? AND ?`
///   （TS と同じく card_id の範囲値は文字列のままバインドする）
/// - `all = true`: 範囲内全件（ORDER BY / LIMIT なし）。前提: range が両端あることは
///   ハンドラ側で 400 検証済み
/// - `all = false` かつ `random = true`: `ORDER BY RANDOM() LIMIT max`
/// - `all = false` かつ `random = false`: `LIMIT max`（先頭 N 件）
///
/// SQL 文面は [`build_seek_sql`]（TS と同一の分岐・文言）で組み立て、bind は
/// range / max のみ。ユーザ入力（cols）はハンドラ側の whitelist 検証を通った静的な
/// 列名のみが SQL に入るため注入面はない（TS は cols を SQL へ直接結合する点が
/// 意図した逸脱）。
pub async fn seek_cards(
    db: &D1Database,
    select: &SeekSelect,
    range: Option<(&str, &str)>,
    random: bool,
    all: bool,
    max: usize,
) -> Result<Vec<serde_json::Value>> {
    let sql = build_seek_sql(select, range.is_some(), random, all);
    let mut bindings: Vec<wasm_bindgen::JsValue> = Vec::new();

    if let Some((start, end)) = range {
        bindings.push(start.into());
        bindings.push(end.into());
        if !all {
            bindings.push((max as i32).into());
        }
    } else {
        bindings.push((max as i32).into());
    }

    let stmt = db.prepare(&sql).bind(&bindings)?;
    let results = stmt.all().await?;
    results.results::<serde_json::Value>()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cards_columns_whitelist_is_17_schema_columns_without_created_at() {
        // sql/schema.sql の cards 18 列から created_at を除いた 17 列（schema 順）
        assert_eq!(CARDS_COLUMNS.len(), 17);
        assert!(!CARDS_COLUMNS.contains(&"created_at"));
        assert_eq!(CARDS_COLUMNS.first(), Some(&"card_id"));
        assert_eq!(CARDS_COLUMNS.last(), Some(&"link_value"));
        // 他 SELECT（CardInfo 9 列）で使っている列も含む
        for column in ["card_id", "name", "normalized_name", "description"] {
            assert!(CARDS_COLUMNS.contains(&column), "missing: {}", column);
        }
    }

    #[test]
    fn build_seek_sql_columns_projection_all_branches() {
        // cols 投影の全分岐（範囲なし×random/先頭・範囲×all/random/先頭）
        let columns = SeekSelect::Columns(vec!["card_id", "name"]);
        assert_eq!(
            build_seek_sql(&columns, false, true, false),
            "SELECT card_id, name FROM cards ORDER BY RANDOM() LIMIT ?"
        );
        assert_eq!(
            build_seek_sql(&columns, false, false, false),
            "SELECT card_id, name FROM cards LIMIT ?"
        );
        // 範囲 + all: ORDER BY / LIMIT なし（random は無視される）
        assert_eq!(
            build_seek_sql(&columns, true, true, true),
            "SELECT card_id, name FROM cards WHERE card_id BETWEEN ? AND ?"
        );
        assert_eq!(
            build_seek_sql(&columns, true, false, true),
            "SELECT card_id, name FROM cards WHERE card_id BETWEEN ? AND ?"
        );
        assert_eq!(
            build_seek_sql(&columns, true, true, false),
            "SELECT card_id, name FROM cards WHERE card_id BETWEEN ? AND ? ORDER BY RANDOM() LIMIT ?"
        );
        assert_eq!(
            build_seek_sql(&columns, true, false, false),
            "SELECT card_id, name FROM cards WHERE card_id BETWEEN ? AND ? LIMIT ?"
        );
    }

    #[test]
    fn build_seek_sql_all_is_explicit_17_columns_not_select_star() {
        // colAll: TS は SELECT * だが Rust は whitelist 17 列の明示列挙
        // （created_at が応答に露出しないようにする意図した差異。観測出力は TS と同一）
        let all_columns = "card_id, name, ruby, normalized_name, normalized_ruby, card_type, attribute, level, atk, def, description, race, monster_types, spell_effect_type, trap_effect_type, link_markers, link_value";
        assert_eq!(
            build_seek_sql(&SeekSelect::All, false, true, false),
            format!(
                "SELECT {} FROM cards ORDER BY RANDOM() LIMIT ?",
                all_columns
            )
        );
        assert_eq!(
            build_seek_sql(&SeekSelect::All, false, false, false),
            format!("SELECT {} FROM cards LIMIT ?", all_columns)
        );
        assert_eq!(
            build_seek_sql(&SeekSelect::All, true, true, true),
            format!(
                "SELECT {} FROM cards WHERE card_id BETWEEN ? AND ?",
                all_columns
            )
        );
        assert_eq!(
            build_seek_sql(&SeekSelect::All, true, true, false),
            format!(
                "SELECT {} FROM cards WHERE card_id BETWEEN ? AND ? ORDER BY RANDOM() LIMIT ?",
                all_columns
            )
        );
        assert_eq!(
            build_seek_sql(&SeekSelect::All, true, false, false),
            format!(
                "SELECT {} FROM cards WHERE card_id BETWEEN ? AND ? LIMIT ?",
                all_columns
            )
        );
    }
}
