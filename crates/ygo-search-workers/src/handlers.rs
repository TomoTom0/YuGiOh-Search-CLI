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
// ============================================================

/// GET クエリ `max` の既定値（TS `seek-cards.ts` と同じ 10）
const SEEK_DEFAULT_MAX: i64 = 10;

/// `max` の上限（TS `validation.ts` の `MAX_LIMIT = 100`）
const MAX_LIMIT: i64 = 100;

/// JS `parseInt(str, 10)` 相当: 先頭の符号付き 10 進整数部を読む。
/// 数字が一つも無い場合は `None`（JS の NaN。ハンドラ仕様として NaN は既定値扱い）。
/// 桁あふれは飽和させる（JS は巨大数を返して max 検証で 400 になるため同挙動にする）。
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

/// GET /api/cards/seek — ランダム/範囲/先頭 N 件のカード取得。
/// TS `src/lib/worker/handlers/seek-cards.ts` の移植。
///
/// - `max`: 既定 10。1..=100（MAX_LIMIT）外は 400（メッセージは TS と同一）
/// - `random`: `false` 指定時のみ無効（既定有効）
/// - `range_start` / `range_end`: 両方ある場合のみ card_id の BETWEEN 範囲指定
/// - `all`: `true` 指定時のみ有効。有効かつ範囲なしは 400
/// - `cols` / `colAll`: 無視する（CardInfo が固定スキーマのため。core fs 版
///   `seek_cards` と同じ既存の差異）
pub async fn seek_cards(req: Request, ctx: RouteContext<()>) -> Result<Response> {
    let url = req.url()?;
    let param = |name: &str| {
        url.query_pairs()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.to_string())
    };

    let max = param("max")
        .and_then(|v| parse_js_int(&v))
        .unwrap_or(SEEK_DEFAULT_MAX);
    let random = param("random").as_deref() != Some("false");
    let range_start = param("range_start");
    let range_end = param("range_end");
    let all = param("all").as_deref() == Some("true");

    if !(1..=MAX_LIMIT).contains(&max) {
        return error_response(
            &format!("Max must be between 1 and {}", MAX_LIMIT),
            400,
            None,
            None,
        );
    }
    if all && (range_start.is_none() || range_end.is_none()) {
        return error_response(
            "all parameter requires range_start and range_end",
            400,
            None,
            None,
        );
    }

    let range = match (&range_start, &range_end) {
        (Some(s), Some(e)) => Some((s.as_str(), e.as_str())),
        _ => None,
    };

    let db = ctx.env.d1("DB")?;
    match db::seek_cards(&db, range, random, all, max as usize).await {
        Ok(cards) => {
            let total = cards.len();
            cors_json_response(&SeekCardsResponse { data: cards, total })
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
}
