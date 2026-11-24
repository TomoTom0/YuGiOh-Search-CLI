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

// ============================================================
// TASK-27: seek / convert エンドポイント
// （TS `seek-cards.ts` / `convert.ts` の Workers crate への移植）
// TASK-51: seek に cols/colAll 列投影を追加（`resolve_seek_select`）
// ============================================================

/// GET クエリ `max` の既定値（TS `seek-cards.ts` と同じ 10）
const SEEK_DEFAULT_MAX: i64 = 10;

/// `max` の上限（TS `validation.ts` の `MAX_LIMIT = 100`）
const MAX_LIMIT: i64 = 100;

/// JS `parseInt(str, 10)` 相当: 先頭の符号付き 10 進整数部を読む。
/// 数字が一つも無い場合は `None`（JS の NaN。ハンドラ仕様として NaN は既定値扱い）。
/// 桁あふれは飽和させる（JS は巨大数を返して max 検証で 400 になるため同挙動にする）。
///
/// TASK-52 で TS 正本（`src/lib/worker/handlers/seek-cards.ts`）を読んで実検証した
/// 意図した逸脱: TS では `max=abc` の NaN が検証（`NaN > 100 || NaN < 1` は共に
/// false）を素通りし、`LIMIT ?` への bind で D1 エラーとなって 500 を返す。
/// Rust 版は NaN を「未指定」と同じ既定値扱いにし 200 を返す（検証を素通りした
/// NaN のエラー再現ではなく、ハンドラ仕様としてこちらを正とする）。
fn parse_js_int(s: &str) -> Option<i64> {
    let s = s.trim_start();
    let body = s.strip_prefix(['+', '-']).unwrap_or(s);
    let digits_end = body
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(body.len());
    if digits_end == 0 {
        return None;
    }
    let signed_end = s.len() - body.len() + digits_end;
    match s[..signed_end].parse::<i64>() {
        Ok(n) => Some(n),
        Err(_) => Some(if s.starts_with("-") {
            i64::MIN
        } else {
            i64::MAX
        }),
    }
}

/// seek ハンドラのクエリ検証・解決エラー（検証順序を native テストで固定するため
/// handler から `resolve_seek_params` へ分離している）。
#[derive(Debug, Clone, PartialEq, Eq)]
enum SeekParamError {
    /// 400 Bad Request（メッセージは TS と同一）
    BadRequest(String),
    /// cols 列解決失敗。TS では D1 prepare エラー → catch → 500 になるため
    /// 500 "Internal server error" で応答する
    InvalidColumns(String),
}

/// seek クエリの解決結果（`db::seek_cards` への入力）。
#[derive(Debug)]
struct SeekParams {
    /// 1..=MAX_LIMIT に検証済み
    max: usize,
    /// `random=false` 指定時のみ無効（既定有効）
    random: bool,
    /// 空文字を「無し」扱い（TS truthiness と一致）にした後の range。両端ある場合のみ Some
    range: Option<(String, String)>,
    /// `all=true` 指定時のみ有効
    all: bool,
    /// cols / colAll から解決した SELECT 構成
    select: db::SeekSelect,
}

/// seek ハンドラのクエリパラメータ検証・解決（TS `seek-cards.ts` と同一の順序）。
///
/// 検証順序:
/// 1. `max`（1..=MAX_LIMIT 外は 400）
/// 2. `all` には range 両端が必要（欠けていれば 400）
/// 3. cols / colAll の列解決（[`resolve_seek_select`]。失敗は 500 扱い）
///
/// TASK-51（D4-a）: `range_start` / `range_end` の空文字は「無し」扱いにする
/// （TS `rangeStart && rangeEnd` の truthiness 判定と一致）。
fn resolve_seek_params(
    param: impl Fn(&str) -> Option<String>,
) -> Result<SeekParams, SeekParamError> {
    let max = param("max")
        .as_deref()
        .and_then(parse_js_int)
        .unwrap_or(SEEK_DEFAULT_MAX);
    if !(1..=MAX_LIMIT).contains(&max) {
        return Err(SeekParamError::BadRequest(format!(
            "Max must be between 1 and {}",
            MAX_LIMIT
        )));
    }

    // TS の truthiness 判定（`rangeStart && rangeEnd`）と同じく空文字は「無し」扱い
    let range_start = param("range_start").filter(|v| !v.is_empty());
    let range_end = param("range_end").filter(|v| !v.is_empty());
    let all = param("all").as_deref() == Some("true");
    if all && (range_start.is_none() || range_end.is_none()) {
        return Err(SeekParamError::BadRequest(
            "all parameter requires range_start and range_end".to_string(),
        ));
    }

    let col_all = param("colAll").as_deref() == Some("true");
    let select = resolve_seek_select(col_all, param("cols").as_deref())
        .map_err(SeekParamError::InvalidColumns)?;

    Ok(SeekParams {
        max: max as usize,
        random: param("random").as_deref() != Some("false"),
        range: match (range_start, range_end) {
            (Some(start), Some(end)) => Some((start, end)),
            _ => None,
        },
        all,
        select,
    })
}

/// cols / colAll クエリパラメータから SELECT 列構成を解決する純粋関数（native テスト可）。
///
/// TS `seek-cards.ts` と同一の優先順位:
/// - `colAll=true` は常に [`db::SeekSelect::All`]（cols の検証はしない。
///   `?colAll=true&cols=garbage` は TS でも 200 で通るため同じく通す）
/// - `colAll` が `true` 以外（false・未指定・他値）は cols を解釈:
///   - なし・空文字 → TS 既定の `card_id, name`
///   - あり → `,` split → trim → [`db::CARDS_COLUMNS`] whitelist 完全一致検証 →
///     Columns。未知列・空セグメント（`cols=,` 等）は列名を含む Err
///
/// TS は cols を SQL へ直接結合するため injection 可能だが、Rust 版は whitelist
/// 検証済みの静的な列名のみを SQL に出す（注入面を閉じる意図した逸脱。
/// 大文字・引用符付き・`cards.card_id` 修飾名・`created_at` は TS では通るが
/// Rust では未知列扱いで 500）。
fn resolve_seek_select(col_all: bool, cols: Option<&str>) -> Result<db::SeekSelect, String> {
    if col_all {
        return Ok(db::SeekSelect::All);
    }
    let Some(cols) = cols.filter(|c| !c.is_empty()) else {
        return Ok(db::SeekSelect::Columns(vec!["card_id", "name"]));
    };
    let columns: Result<Vec<&'static str>, String> = cols
        .split(',')
        .map(|segment| {
            let trimmed = segment.trim();
            db::CARDS_COLUMNS
                .iter()
                .copied()
                .find(|column| *column == trimmed)
                .ok_or_else(|| format!("unknown column: {:?}", trimmed))
        })
        .collect();
    Ok(db::SeekSelect::Columns(columns?))
}

/// GET /api/cards/seek — ランダム/範囲/先頭 N 件のカード取得。
/// TS `src/lib/worker/handlers/seek-cards.ts` の移植（TASK-51 で cols/colAll 列投影対応）。
///
/// - `max`: 既定 10。1..=100（MAX_LIMIT）外は 400（メッセージは TS と同一）
/// - `random`: `false` 指定時のみ無効（既定有効）
/// - `range_start` / `range_end`: 両方ある場合のみ card_id の BETWEEN 範囲指定。
///   空文字は「無し」扱い（TS truthiness と一致。`?all=true&range_start=&range_end=5`
///   は 400）
/// - `all`: `true` 指定時のみ有効。有効かつ範囲なしは 400
/// - `cols`: 投影列（`,` 区切り・trim 対応・[`resolve_seek_select`] の whitelist 検証）。
///   未知列・空セグメントは 500（TS の D1 prepare エラー → 500 と同一の観測挙動）
/// - `colAll`: `true` で全 17 列（`cols` より優先し cols の検証はスキップ）
/// - クエリ解析は `url` crate の `query_pairs`（form_urlencoded）。ペア区切りは
///   TS `URLSearchParams` と同じく `&` のみで、`;` は区切りにならないことを
///   TASK-52 で実検証した（`cols=name;atk` は単一値として未知列 -> 500 で、
///   TS の D1 prepare エラー -> 500 と同一の観測挙動）
/// - 応答 `data` は D1 row の直接透過（key は D1 列名＝snake_case）。cols/colAll
///   無指定時は TS 既定の `card_id, name` 投影になる（旧実装の全列 CardInfo からの
///   破壊的変更）
pub async fn seek_cards(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let url = req.url()?;
    let params = match resolve_seek_params(|name: &str| {
        url.query_pairs()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.to_string())
    }) {
        Ok(params) => params,
        Err(SeekParamError::BadRequest(message)) => {
            return error_response(&message, 400, None, None);
        }
        // TS では cols 不正は D1 prepare エラー → catch → 500（console.error 出力）。
        // 同一の観測挙動（500・同一応答形状）にする
        Err(SeekParamError::InvalidColumns(detail)) => {
            console_error!("Seek cards error: {}", detail);
            return error_response("Internal server error", 500, None, None);
        }
    };

    let db = ctx.env.d1("DB")?;
    let range = params
        .range
        .as_ref()
        .map(|(start, end)| (start.as_str(), end.as_str()));
    match db::seek_cards(
        &db,
        &params.select,
        range,
        params.random,
        params.all,
        params.max,
    )
    .await
    {
        Ok(rows) => {
            let total = rows.len();
            cors_json_response(&SeekCardsResponse { data: rows, total })
        }
        Err(e) => {
            // TS と同じく D1 エラーは 500 の errorResponse 形状で応答
            console_error!("Seek cards error: {:?}", e);
            error_response("Internal server error", 500, None, None)
        }
    }
}

/// convert 対応フォーマット（TS `convert.ts` は json/jsonl のみ。core の format feature は
/// wasm32 で compile_error になるため workers 側で実装する）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ConvertFormat {
    Json,
    Jsonl,
}

impl ConvertFormat {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            ConvertFormat::Json => "json",
            ConvertFormat::Jsonl => "jsonl",
        }
    }

    pub(crate) fn parse(s: &str) -> Option<Self> {
        match s {
            "json" => Some(ConvertFormat::Json),
            "jsonl" => Some(ConvertFormat::Jsonl),
            _ => None,
        }
    }
}

/// TS `convert.ts` と同一の自動判定:
/// 改行を含み trim 後が `[` で始まらなければ jsonl、それ以外は json。
pub(crate) fn detect_input_format(input: &str) -> ConvertFormat {
    if input.contains("\n") && !input.trim_start().starts_with("[") {
        ConvertFormat::Jsonl
    } else {
        ConvertFormat::Json
    }
}

/// TS `parseFormatString` 相当: json は厳密 JSON、jsonl は空行を除く各行を
/// JSON として読んで配列化する。失敗時は詳細メッセージを返す。
pub(crate) fn parse_input(input: &str, format: ConvertFormat) -> Result<serde_json::Value, String> {
    match format {
        ConvertFormat::Json => serde_json::from_str(input).map_err(|e| e.to_string()),
        ConvertFormat::Jsonl => {
            let mut items = Vec::new();
            for (i, line) in input.lines().enumerate() {
                if line.trim().is_empty() {
                    continue;
                }
                let value: serde_json::Value =
                    serde_json::from_str(line).map_err(|e| format!("line {}: {}", i + 1, e))?;
                items.push(value);
            }
            Ok(serde_json::Value::Array(items))
        }
    }
}

/// TS `formatOutput` 相当: json は 2 スペース pretty、jsonl は配列要素を compact にして
/// 改行結合（非配列は 1 要素化）。
///
/// 既知の差異: serde_json の Map は key 順を保持しないため、json 出力のオブジェクト key は
/// 入力順ではなく整列される（TS `JSON.stringify` は挿入順保持）。core format feature
/// （`crates/ygo-search/src/format/mod.rs`）と同じ受容済みの差異。
pub(crate) fn format_output(
    data: &serde_json::Value,
    format: ConvertFormat,
) -> Result<String, String> {
    match format {
        ConvertFormat::Json => serde_json::to_string_pretty(data).map_err(|e| e.to_string()),
        ConvertFormat::Jsonl => {
            let items: Vec<&serde_json::Value> = match data {
                serde_json::Value::Array(arr) => arr.iter().collect(),
                other => vec![other],
            };
            let lines: Vec<String> = items
                .into_iter()
                .map(|item| serde_json::to_string(item).map_err(|e| e.to_string()))
                .collect::<Result<_, _>>()?;
            Ok(lines.join("\n"))
        }
    }
}

/// POST /api/convert — json/jsonl フォーマット変換。TS `convert.ts` の移植。
///
/// リクエストボディは TS が `any` で truthiness 判定するため、型付き struct ではなく
/// `serde_json::Value` から直接フィールドを読む（`""` / `0` / `null` / 非オブジェクトは
/// 「無し」と同じ扱いになり TS の挙動と一致する）。
pub async fn convert(mut req: Request, _ctx: RouteContext<()>) -> Result<Response> {
    let body: serde_json::Value = match req.json().await {
        Ok(v) => v,
        // TS: request.json() の失敗も catch 節で CONVERSION_ERROR(500) 扱い
        Err(e) => return conversion_error(&e.to_string()),
    };

    let input = body.get("input").and_then(|v| v.as_str());
    // TS: `body.inputFormat || "json"` — 空文字も省略扱いで自動判定に入る
    let input_format = body
        .get("inputFormat")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());
    let output_format = body
        .get("outputFormat")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());

    // TS: `!body || !body.input` → 400 MISSING_INPUT
    if input.unwrap_or("").is_empty() {
        return error_response("Missing input parameter", 400, Some("MISSING_INPUT"), None);
    }
    let input = input.unwrap_or_default();
    // TS: `!body.outputFormat` → 400 MISSING_OUTPUT_FORMAT
    let Some(output_format) = output_format else {
        return error_response(
            "Missing outputFormat parameter",
            400,
            Some("MISSING_OUTPUT_FORMAT"),
            None,
        );
    };

    let input_format = match input_format {
        Some(f) => f.to_string(),
        None => detect_input_format(input).as_str().to_string(),
    };
    let Some(input_fmt) = ConvertFormat::parse(&input_format) else {
        return error_response(
            &format!(
                "Invalid inputFormat \"{}\". Valid formats: json, jsonl",
                input_format
            ),
            400,
            Some("INVALID_INPUT_FORMAT"),
            None,
        );
    };
    let Some(output_fmt) = ConvertFormat::parse(output_format) else {
        return error_response(
            &format!(
                "Invalid outputFormat \"{}\". Valid formats: json, jsonl",
                output_format
            ),
            400,
            Some("INVALID_OUTPUT_FORMAT"),
            None,
        );
    };

    let data = match parse_input(input, input_fmt) {
        Ok(d) => d,
        Err(detail) => return conversion_error(&detail),
    };
    let converted = match format_output(&data, output_fmt) {
        Ok(s) => s,
        Err(detail) => return conversion_error(&detail),
    };

    cors_json_response(&ConvertResponse {
        converted,
        input_format: input_fmt.as_str().to_string(),
        output_format: output_fmt.as_str().to_string(),
    })
}

/// 成功・エラー応答に共通で付ける CORS ヘッダ（名前と値）。
/// native テストから検証できるよう、ヘッダ適用（worker 型は wasm 専用）から
/// 分離した純粋データとして持つ。error_response / cors_json_response の両方が使う。
fn cors_header_pairs() -> [(&'static str, &'static str); 1] {
    [("Access-Control-Allow-Origin", "*")]
}

/// cors_header_pairs を worker の Headers に適用する。
fn cors_headers() -> Result<Headers> {
    let headers = Headers::new();
    for (name, value) in cors_header_pairs() {
        headers.set(name, value)?;
    }
    Ok(headers)
}

/// TS `errorResponse`（`src/lib/worker/response.ts`）と同一形状のエラー応答を返す。
/// 形状: `{error, timestamp}` + 任意の `code` / `details`。
/// 成功応答（`cors_json_response`）と同じ CORS ヘッダを含む（TS `errorResponse` が
/// `Access-Control-Allow-Origin: *` を返すのと同一。ブラウザがエラー本文を読めるようにする）。
fn error_response(
    message: &str,
    status: u16,
    code: Option<&str>,
    details: Option<Vec<String>>,
) -> Result<Response> {
    let mut error = serde_json::json!({
        "error": message,
        "timestamp": iso_now(),
    });
    if let Some(code) = code {
        error["code"] = serde_json::Value::String(code.to_string());
    }
    if let Some(details) = details.filter(|d| !d.is_empty()) {
        error["details"] =
            serde_json::Value::Array(details.into_iter().map(serde_json::Value::String).collect());
    }
    // Content-Type: application/json は from_json が設定する
    Ok(Response::from_json(&error)?
        .with_headers(cors_headers()?)
        .with_status(status))
}

/// TS `jsonResponse` 相当（`Access-Control-Allow-Origin: *` ヘッダ付き JSON 応答）。
fn cors_json_response<T: serde::Serialize>(data: &T) -> Result<Response> {
    Ok(Response::from_json(data)?.with_headers(cors_headers()?))
}

/// 変換失敗。TS `convert.ts` の catch 節（500 CONVERSION_ERROR、details に原因）。
fn conversion_error(detail: &str) -> Result<Response> {
    error_response(
        "Conversion failed",
        500,
        Some("CONVERSION_ERROR"),
        Some(vec![detail.to_string()]),
    )
}

/// JS `new Date().toISOString()`（errorResponse の timestamp と同一形式）。
fn iso_now() -> String {
    worker::js_sys::Date::new_0().to_iso_string().into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_js_int_reads_leading_digits_like_js_parseint() {
        assert_eq!(parse_js_int("10"), Some(10));
        assert_eq!(parse_js_int("10abc"), Some(10)); // JS parseInt は接頭辞を読む
        assert_eq!(parse_js_int(" 5"), Some(5)); // 先頭空白は無視
        assert_eq!(parse_js_int("-3"), Some(-3));
        assert_eq!(parse_js_int("+7"), Some(7));
        assert_eq!(parse_js_int("0"), Some(0));
        assert_eq!(parse_js_int("abc"), None); // JS NaN -> 既定値扱い
        assert_eq!(parse_js_int(""), None);
        assert_eq!(parse_js_int("+"), None);
    }

    #[test]
    fn parse_js_int_overflow_saturates_into_error_range() {
        // JS parseInt は巨大数も「読める」ため max 検証で 400 になる。飽和値も 1..=100 外。
        assert_eq!(parse_js_int("99999999999999999999999"), Some(i64::MAX));
        assert_eq!(parse_js_int("-99999999999999999999999"), Some(i64::MIN));
    }

    #[test]
    fn convert_format_parse_only_json_and_jsonl() {
        assert_eq!(ConvertFormat::parse("json"), Some(ConvertFormat::Json));
        assert_eq!(ConvertFormat::parse("jsonl"), Some(ConvertFormat::Jsonl));
        assert_eq!(ConvertFormat::parse("yaml"), None);
        assert_eq!(ConvertFormat::parse(""), None);
        assert_eq!(ConvertFormat::parse("JSON"), None); // 大文字小文字を区別
    }

    #[test]
    fn detect_input_format_matches_ts_rules() {
        // 改行あり + trim 後 [ 始まりでない → jsonl
        assert_eq!(
            detect_input_format("{\"a\":1}\n{\"b\":2}"),
            ConvertFormat::Jsonl
        );
        assert_eq!(detect_input_format("1\n2"), ConvertFormat::Jsonl);
        // 改行があっても [ 始まりは json
        assert_eq!(
            detect_input_format("[{\"a\":1},\n{\"b\":2}]"),
            ConvertFormat::Json
        );
        assert_eq!(detect_input_format("  [1,\n2]"), ConvertFormat::Json);
        // 改行なしは json
        assert_eq!(detect_input_format("{\"a\":1}"), ConvertFormat::Json);
    }

    #[test]
    fn json_to_jsonl_compact_join() {
        let data = parse_input("[{\"a\":1},{\"b\":2}]", ConvertFormat::Json).unwrap();
        let out = format_output(&data, ConvertFormat::Jsonl).unwrap();
        assert_eq!(out, "{\"a\":1}\n{\"b\":2}");
    }

    #[test]
    fn jsonl_parse_skips_blank_lines_and_json_output_pretty() {
        let data = parse_input("{\"a\":1}\n\n  \n{\"b\":2}\n", ConvertFormat::Jsonl).unwrap();
        assert_eq!(
            data,
            serde_json::json!([
                {"a": 1},
                {"b": 2}
            ])
        );
        let out = format_output(&data, ConvertFormat::Json).unwrap();
        assert_eq!(out, "[\n  {\n    \"a\": 1\n  },\n  {\n    \"b\": 2\n  }\n]");
    }

    #[test]
    fn jsonl_round_trip() {
        let input = "{\"a\":1}\n{\"b\":2}";
        let data = parse_input(input, ConvertFormat::Jsonl).unwrap();
        let out = format_output(&data, ConvertFormat::Jsonl).unwrap();
        assert_eq!(out, input);
    }

    #[test]
    fn jsonl_output_wraps_non_array_as_single_line() {
        let data = parse_input("{\"a\":1}", ConvertFormat::Json).unwrap();
        assert_eq!(
            format_output(&data, ConvertFormat::Jsonl).unwrap(),
            "{\"a\":1}"
        );
        // スカラー値も 1 要素化
        let scalar = parse_input("42", ConvertFormat::Json).unwrap();
        assert_eq!(format_output(&scalar, ConvertFormat::Jsonl).unwrap(), "42");
    }

    #[test]
    fn parse_invalid_json_is_error() {
        assert!(parse_input("{invalid}", ConvertFormat::Json).is_err());
        // 空文字列も JSON として不正（TS は JSON.parse("") で例外 → CONVERSION_ERROR）
        assert!(parse_input("", ConvertFormat::Json).is_err());
    }

    #[test]
    fn parse_invalid_jsonl_line_is_error_with_line_number() {
        let err = parse_input("{\"a\":1}\n{oops}", ConvertFormat::Jsonl).unwrap_err();
        assert!(err.starts_with("line 2:"), "unexpected: {}", err);
    }

    #[test]
    fn cors_header_pairs_include_allow_origin_wildcard() {
        // error_response / cors_json_response は worker 型 (wasm 専用) を使うため
        // native テストでは直接呼べない。両者が共有する cors_header_pairs を検証する。
        assert_eq!(cors_header_pairs(), [("Access-Control-Allow-Origin", "*")]);
    }

    // ============================================================
    // TASK-51: seek の cols/colAll 列投影
    // ============================================================

    #[test]
    fn resolve_seek_select_col_all_takes_precedence_and_skips_cols_validation() {
        // TS の if/else と同じ優先順位: colAll=true は cols に関わらず常に All
        // （?colAll=true&cols=garbage は TS でも 200 で通るため同じく通す）
        assert_eq!(resolve_seek_select(true, None), Ok(db::SeekSelect::All));
        assert_eq!(
            resolve_seek_select(true, Some("atk")),
            Ok(db::SeekSelect::All)
        );
        assert_eq!(
            resolve_seek_select(true, Some("garbage")),
            Ok(db::SeekSelect::All)
        );
    }

    #[test]
    fn resolve_seek_select_interprets_cols_when_col_all_not_true() {
        assert_eq!(
            resolve_seek_select(false, Some("name, atk")),
            Ok(db::SeekSelect::Columns(vec!["name", "atk"]))
        );
    }

    #[test]
    fn resolve_seek_select_defaults_to_card_id_and_name_when_no_cols_or_empty() {
        // cols なし・空文字は TS 既定の card_id, name
        assert_eq!(
            resolve_seek_select(false, None),
            Ok(db::SeekSelect::Columns(vec!["card_id", "name"]))
        );
        assert_eq!(
            resolve_seek_select(false, Some("")),
            Ok(db::SeekSelect::Columns(vec!["card_id", "name"]))
        );
    }

    #[test]
    fn resolve_seek_select_splits_and_trims_segments() {
        assert_eq!(
            resolve_seek_select(false, Some(" name ,atk\t")),
            Ok(db::SeekSelect::Columns(vec!["name", "atk"]))
        );
    }

    #[test]
    fn resolve_seek_select_unknown_column_is_err_with_column_name() {
        let err = resolve_seek_select(false, Some("atk, garbage")).unwrap_err();
        assert!(err.contains("garbage"), "unexpected: {}", err);
    }

    #[test]
    fn resolve_seek_select_empty_segment_is_err() {
        // cols=, 等の空セグメントは Err（列名〔空〕を含むメッセージ）
        let err = resolve_seek_select(false, Some("atk,,def")).unwrap_err();
        assert!(err.contains("unknown column"), "unexpected: {}", err);
        let err = resolve_seek_select(false, Some(",")).unwrap_err();
        assert!(err.contains("unknown column"), "unexpected: {}", err);
    }

    #[test]
    fn resolve_seek_params_max_validation_precedes_select_resolution() {
        // max 不正 + cols 未知の併記 → 400（max 検証）が select 解決（500）に先行する
        let err = resolve_seek_params(|name| match name {
            "max" => Some("0".to_string()),
            "cols" => Some("garbage".to_string()),
            _ => None,
        })
        .unwrap_err();
        assert_eq!(
            err,
            SeekParamError::BadRequest("Max must be between 1 and 100".to_string())
        );
    }

    #[test]
    fn resolve_seek_params_unknown_cols_is_invalid_columns_not_bad_request() {
        // cols 未知列は 400 BadRequest ではなく 500 扱いの InvalidColumns variant に
        // 分類される（map_err の接着部分の固定。設計 D3: 未知列を 400 にする案は明示的に
        // 棄却済みで、TS の D1 prepare エラー -> 500 と同じ観測挙動が契約）
        let err = resolve_seek_params(|name| match name {
            "cols" => Some("garbage".to_string()),
            _ => None,
        })
        .unwrap_err();
        assert!(matches!(err, SeekParamError::InvalidColumns(_)));
    }

    #[test]
    fn resolve_seek_params_empty_range_string_is_treated_as_absent() {
        // D4-a: ?all=true&range_start=&range_end=5 → 空文字は「無し」扱いで 400
        // （TS の truthiness 判定と一致。旧実装は BETWEEN を実行していた）
        let err = resolve_seek_params(|name| match name {
            "all" => Some("true".to_string()),
            "range_start" => Some(String::new()),
            "range_end" => Some("5".to_string()),
            _ => None,
        })
        .unwrap_err();
        assert_eq!(
            err,
            SeekParamError::BadRequest(
                "all parameter requires range_start and range_end".to_string()
            )
        );
    }

    #[test]
    fn resolve_seek_params_partially_empty_range_yields_no_range() {
        // range_start=5&range_end=（片方だけ空文字）→ range なし（TS の && と同じ）
        let params = resolve_seek_params(|name| match name {
            "range_start" => Some("5".to_string()),
            "range_end" => Some(String::new()),
            _ => None,
        })
        .unwrap();
        assert_eq!(params.range, None);
    }

    #[test]
    fn resolve_seek_params_defaults_and_full_resolution() {
        // 無指定: max=10・random 有効・range なし・all 無効・既定投影 card_id, name
        let params = resolve_seek_params(|_| None).unwrap();
        assert_eq!(params.max, 10);
        assert!(params.random);
        assert_eq!(params.range, None);
        assert!(!params.all);
        assert_eq!(
            params.select,
            db::SeekSelect::Columns(vec!["card_id", "name"])
        );

        // 全指定: range あり・random=false・cols 投影
        let params = resolve_seek_params(|name| match name {
            "max" => Some("50".to_string()),
            "random" => Some("false".to_string()),
            "range_start" => Some("100000".to_string()),
            "range_end" => Some("200000".to_string()),
            "all" => Some("true".to_string()),
            "cols" => Some("name, atk".to_string()),
            _ => None,
        })
        .unwrap();
        assert_eq!(params.max, 50);
        assert!(!params.random);
        assert_eq!(
            params.range,
            Some(("100000".to_string(), "200000".to_string()))
        );
        assert!(params.all);
        assert_eq!(params.select, db::SeekSelect::Columns(vec!["name", "atk"]));

        // colAll は "true" 完全一致のみ有効（TS === と同じ）。他値は cols を解釈
        let params = resolve_seek_params(|name| match name {
            "colAll" => Some("1".to_string()),
            "cols" => Some("name".to_string()),
            _ => None,
        })
        .unwrap();
        assert_eq!(params.select, db::SeekSelect::Columns(vec!["name"]));
    }

    #[test]
    fn seek_cards_response_serializes_projected_rows_in_envelope() {
        // 投影 row（例: cols=atk）は選択列のみのまま {data, total} に入る
        // （D1 row の直接透過・空文字既定の補完なし）
        let response = SeekCardsResponse {
            data: vec![serde_json::json!({"atk": 100})],
            total: 1,
        };
        let value = serde_json::to_value(&response).unwrap();
        assert_eq!(
            value,
            serde_json::json!({"data": [{"atk": 100}], "total": 1})
        );
    }

    // ============================================================
    // TASK-52: TS 準拠細部の検証（REVIEW-1 P3 観察の負債解消）
    // ============================================================

    #[test]
    fn resolve_seek_params_non_numeric_max_falls_back_to_default() {
        // max=abc: TS は parseInt -> NaN が検証（NaN > 100 || NaN < 1 は共に false）を
        // 素通りし、NaN が LIMIT ? に bind されて D1 エラー -> 500 になる。
        // Rust 版は意図した逸脱として NaN を既定値 10 扱いにする（parse_js_int の
        // doc comment に明記。TASK-52 で TS 正本 seek-cards.ts を読んで実検証した）
        let params = resolve_seek_params(|name| match name {
            "max" => Some("abc".to_string()),
            _ => None,
        })
        .unwrap();
        assert_eq!(params.max, 10);
    }

    #[test]
    fn resolve_seek_params_semicolon_in_cols_is_single_unknown_segment() {
        // クエリのペア区切りは & のみ: url crate の query_pairs が使う
        // form_urlencoded 1.2.2 は & でのみ分割し（ソース実検証済み・TASK-52）、
        // TS URLSearchParams も同じ。cols=name;atk は単一値 "name;atk" となり、
        // , 分割でも割れない未知セグメントとして InvalidColumns（500 扱い）になる
        // （TS は SQL へ直接結合され D1 prepare エラー -> 500 で同一の観測挙動）
        let err = resolve_seek_params(|name| match name {
            "cols" => Some("name;atk".to_string()),
            _ => None,
        })
        .unwrap_err();
        assert!(matches!(err, SeekParamError::InvalidColumns(_)));
    }
}
