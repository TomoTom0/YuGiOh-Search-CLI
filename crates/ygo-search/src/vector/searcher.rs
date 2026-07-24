//! vector 検索（M3-T1）。`lancedb` 接続・`list_tables`・`search_table`・`vector_search_*`。
//!
//! TS `src/lib/vector/searcher.ts` の Rust 移植。
//!
//! **セキュリティ（設計書 §11）**: TS 版は `metadata.${key} = "${value}"` の文字列連結で
//! where 句を組み立てておりインジェクション耐性がない。Rust 版は文字列連結を一切行わず、
//! `lancedb::expr`（DataFusion 式ビルダー）で型付き式を構築し、`only_if_expr` に渡す。
//! `filter`/`exclude` のキーは識別子ホワイトリスト（英数字・アンダースコアのみ）で追加検証する。

use std::collections::BTreeMap;

use arrow_json::LineDelimitedWriter;
use datafusion_expr::Expr;
use datafusion_functions::core::expr_fn::get_field;
use futures::TryStreamExt;
use lancedb::expr::{col, lit};
use lancedb::query::{ExecutableQuery, QueryBase};
use lancedb::DistanceType as LanceDistanceType;

use crate::types::{
    DistanceType, ExcludeOptions, FilterValue, QueryInput, SearchResult, VectorSearchAllResult,
    VectorSearchOptions,
};

use super::embeddings::generate_embedding;
use super::{connect_db, runtime, VectorError};

/// LanceDB に存在するテーブル名一覧（TS `listTables` 相当）。
pub fn list_tables() -> Result<Vec<String>, VectorError> {
    runtime().block_on(async {
        let db = connect_db().await?;
        db.table_names()
            .execute()
            .await
            .map_err(|e| VectorError::ListTables(e.to_string()))
    })
}

fn to_lance_distance(d: DistanceType) -> LanceDistanceType {
    match d {
        DistanceType::L2 => LanceDistanceType::L2,
        DistanceType::Cosine => LanceDistanceType::Cosine,
        DistanceType::Dot => LanceDistanceType::Dot,
    }
}

/// where 式に使う識別子の許可判定（英数字・アンダースコア、先頭は英字/アンダースコア）。
fn valid_identifier(key: &str) -> bool {
    let mut chars = key.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphabetic() || c == '_' => {}
        _ => return false,
    }
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn and_into(acc: &mut Option<Expr>, cond: Expr) {
    *acc = Some(match acc.take() {
        Some(a) => a.and(cond),
        None => cond,
    });
}

/// `filter` を metadata フィールド条件（AND 結合）に変換する（TS `buildWhereClause` 相当）。
fn build_filter_expr(filter: &BTreeMap<String, FilterValue>) -> Result<Option<Expr>, VectorError> {
    let mut acc: Option<Expr> = None;
    for (key, value) in filter {
        if !valid_identifier(key) {
            return Err(VectorError::InvalidFilterKey(key.clone()));
        }
        let field = get_field(col("metadata"), key.clone());
        let cond = match value {
            FilterValue::Str(s) => field.eq(lit(s.as_str())),
            FilterValue::Number(n) => field.eq(lit(*n)),
            FilterValue::Bool(b) => field.eq(lit(*b)),
            FilterValue::Range { min, max } => {
                let mut range_expr: Option<Expr> = None;
                if let Some(min) = min {
                    and_into(&mut range_expr, field.clone().gt_eq(lit(*min)));
                }
                if let Some(max) = max {
                    and_into(&mut range_expr, field.clone().lt_eq(lit(*max)));
                }
                match range_expr {
                    Some(r) => r,
                    None => continue,
                }
            }
        };
        and_into(&mut acc, cond);
    }
    Ok(acc)
}

/// `exclude` を NOT IN 条件（AND 結合）に変換する（TS `buildExcludeClause` 相当）。
///
/// `faqIds` は `faqs` テーブルのみ・`metadata.faqId`（数値列）に適用（TS 実装と同じ制約）。
fn build_exclude_expr(exclude: &ExcludeOptions, table: &str) -> Result<Option<Expr>, VectorError> {
    let mut acc: Option<Expr> = None;

    if let Some(ids) = &exclude.ids {
        if !ids.is_empty() {
            let list: Vec<Expr> = ids.iter().map(|v| lit(v.as_str())).collect();
            and_into(&mut acc, col("id").in_list(list, true));
        }
    }

    if table == "faqs" {
        if let Some(faq_ids) = &exclude.faq_ids {
            if !faq_ids.is_empty() {
                let mut list = Vec::with_capacity(faq_ids.len());
                for v in faq_ids {
                    let n: i64 = v.parse().map_err(|_| {
                        VectorError::InvalidOption(format!(
                            "exclude.faqIds は数値文字列である必要があります: '{v}'"
                        ))
                    })?;
                    list.push(lit(n));
                }
                and_into(
                    &mut acc,
                    get_field(col("metadata"), "faqId").in_list(list, true),
                );
            }
        }
    }

    if let Some(categories) = &exclude.categories {
        if !categories.is_empty() {
            let list: Vec<Expr> = categories.iter().map(|v| lit(v.as_str())).collect();
            and_into(
                &mut acc,
                get_field(col("metadata"), "category").in_list(list, true),
            );
        }
    }

    Ok(acc)
}

fn decode_batch(batch: &arrow_array::RecordBatch) -> Result<Vec<SearchResult>, VectorError> {
    let mut buf = Vec::new();
    {
        let mut writer = LineDelimitedWriter::new(&mut buf);
        writer
            .write(batch)
            .map_err(|e| VectorError::Decode(e.to_string()))?;
        writer
            .finish()
            .map_err(|e| VectorError::Decode(e.to_string()))?;
    }
    let text = String::from_utf8(buf).map_err(|e| VectorError::Decode(e.to_string()))?;

    let mut out = Vec::new();
    for line in text.lines() {
        if line.trim().is_empty() {
            continue;
        }
        let value: serde_json::Value =
            serde_json::from_str(line).map_err(|e| VectorError::Decode(e.to_string()))?;
        let obj = value
            .as_object()
            .ok_or_else(|| VectorError::Decode("行が JSON object ではありません".to_string()))?;
        let id = obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let text_field = obj
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let metadata = obj
            .get("metadata")
            .cloned()
            .unwrap_or(serde_json::Value::Null);
        let score = obj.get("_distance").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
        out.push(SearchResult {
            id,
            text: text_field,
            metadata,
            score,
        });
    }
    Ok(out)
}

async fn search_table_async(
    table: &str,
    query: &QueryInput,
    opts: &VectorSearchOptions,
) -> Result<Vec<SearchResult>, VectorError> {
    let db = connect_db().await?;
    let tbl = db
        .open_table(table)
        .execute()
        .await
        .map_err(|e| VectorError::OpenTable {
            table: table.to_string(),
            message: e.to_string(),
        })?;

    let vector = match query {
        QueryInput::Vector(v) => v.clone(),
        QueryInput::Text(t) => generate_embedding(t)?,
    };

    let limit = opts.limit.unwrap_or(10);
    let distance_type = to_lance_distance(opts.distance_type.unwrap_or_default());

    let mut q = tbl
        .query()
        .nearest_to(vector)
        .map_err(|e| VectorError::Query {
            table: table.to_string(),
            message: e.to_string(),
        })?
        .distance_type(distance_type)
        .limit(limit);

    let mut filter_expr = match &opts.filter {
        Some(f) => build_filter_expr(f)?,
        None => None,
    };
    if let Some(exclude) = &opts.exclude {
        if let Some(exclude_expr) = build_exclude_expr(exclude, table)? {
            and_into(&mut filter_expr, exclude_expr);
        }
    }
    if let Some(expr) = filter_expr {
        q = q.only_if_expr(expr);
    }

    let mut stream = q.execute().await.map_err(|e| VectorError::Query {
        table: table.to_string(),
        message: e.to_string(),
    })?;

    let mut results = Vec::new();
    while let Some(batch) = stream.try_next().await.map_err(|e| VectorError::Query {
        table: table.to_string(),
        message: e.to_string(),
    })? {
        results.extend(decode_batch(&batch)?);
    }

    if let Some(threshold) = opts.threshold {
        results.retain(|r| r.score <= threshold);
    }

    Ok(results)
}

/// 任意テーブルへの vector 検索（TS `searchTable` 相当）。
///
/// `query` が `Text` の場合は embedding 生成（`vector-search` feature の埋め込み推論）を経由する。
pub fn search_table(
    table: &str,
    query: &QueryInput,
    opts: &VectorSearchOptions,
) -> Result<Vec<SearchResult>, VectorError> {
    runtime().block_on(search_table_async(table, query, opts))
}

/// `cards` テーブルへの vector 検索（TS `vectorSearchCards`/`searchCards` 相当）。
pub fn vector_search_cards(
    query: &str,
    opts: &VectorSearchOptions,
) -> Result<Vec<SearchResult>, VectorError> {
    search_table("cards", &QueryInput::Text(query.to_string()), opts)
}

/// `faqs` テーブルへの vector 検索（TS `vectorSearchFaqs`/`searchFaqs` 相当）。
pub fn vector_search_faqs(
    query: &str,
    opts: &VectorSearchOptions,
) -> Result<Vec<SearchResult>, VectorError> {
    search_table("faqs", &QueryInput::Text(query.to_string()), opts)
}

/// 全テーブルへの vector 検索。失敗したテーブルはスキップする（TS `searchAll` 相当）。
pub fn vector_search_all(
    query: &str,
    opts: &VectorSearchOptions,
) -> Result<VectorSearchAllResult, VectorError> {
    runtime().block_on(async {
        let vector = generate_embedding(query)?;
        let tables = {
            let db = connect_db().await?;
            db.table_names()
                .execute()
                .await
                .map_err(|e| VectorError::ListTables(e.to_string()))?
        };

        let mut out = VectorSearchAllResult::new();
        for table in tables {
            let q = QueryInput::Vector(vector.clone());
            match search_table_async(&table, &q, opts).await {
                Ok(results) => {
                    if !results.is_empty() {
                        out.insert(table, results);
                    }
                }
                Err(e) => {
                    eprintln!("Warning: Failed to search table {table}: {e}");
                }
            }
        }
        Ok(out)
    })
}
