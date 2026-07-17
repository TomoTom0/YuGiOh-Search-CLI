//! フォーマット変換（format feature / Layer B-fmt）。
//!
//! `src/lib/format-converter.ts` と同等の純粋関数を提供する。
//! JSON / JSONL / JSONC / YAML の相互変換。
//! ファイル IO（`parseFormatFile`/`convertFormatFile`）は fs feature（M2-T4）スコープ外。

use crate::types::Format;
use serde_json::Value;

/// フォーマット変換のエラー。
#[derive(Debug, thiserror::Error)]
pub enum FormatError {
    #[error("JSON parse failed: {0}")]
    Json(#[from] serde_json::Error),
    #[error("YAML parse failed: {0}")]
    Yaml(#[from] serde_yaml::Error),
    #[error("JSONC parse failed: {0}")]
    Jsonc(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

/// 拡張子からフォーマットを判定する。
///
/// `.json` および未知の拡張子は `Format::Json` にフォールバックする
/// （TS `detectFormat` と同じ挙動）。
pub fn detect_format(filename: &str) -> Format {
    use std::path::Path;
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    match ext.as_deref() {
        Some("jsonl") => Format::Jsonl,
        Some("jsonc") => Format::Jsonc,
        Some("yaml") | Some("yml") => Format::Yaml,
        _ => Format::Json,
    }
}

/// 文字列をパースして `Value` にする。
///
/// - json: 厳密 JSON
/// - jsonc: `//`/`/* */` コメント・トレイリングカンマ許容
/// - jsonl: 改行で分割し空行を除外、各行を JSON パースして配列化
/// - yaml: YAML パース
pub fn parse_format_string(content: &str, format: Format) -> Result<Value, FormatError> {
    match format {
        Format::Json => Ok(serde_json::from_str(content)?),
        Format::Jsonc => {
            let value = jsonc_parser::parse_to_serde_value(content, &Default::default())
                .map_err(|e| FormatError::Jsonc(e.to_string()))?
                .unwrap_or(Value::Null);
            Ok(value)
        }
        Format::Jsonl => {
            let items: Vec<Value> = content
                .lines()
                .filter(|line| !line.trim().is_empty())
                .map(serde_json::from_str::<Value>)
                .collect::<Result<_, _>>()?;
            Ok(Value::Array(items))
        }
        Format::Yaml => Ok(serde_yaml::from_str(content)?),
    }
}

/// `Value` を指定フォーマットの文字列にする。
///
/// - json: 2スペース pretty（`JSON.stringify(data, null, 2)` 相当）
/// - jsonc: `// Generated at <ISO8601 UTC>` ヘッダ + 2スペース pretty
/// - jsonl: 各要素を compact にして `\n` で結合（非配列は1要素化）
/// - yaml: YAML ダンプ
pub fn format_output(data: &Value, format: Format) -> Result<String, FormatError> {
    match format {
        Format::Json => Ok(serde_json::to_string_pretty(data)?),
        Format::Jsonc => {
            let pretty = serde_json::to_string_pretty(data)?;
            Ok(format!("// Generated at {}\n{}", now_iso8601(), pretty))
        }
        Format::Jsonl => {
            let items: Vec<&Value> = match data {
                Value::Array(arr) => arr.iter().collect(),
                other => vec![other],
            };
            let lines: Vec<String> = items
                .iter()
                .map(serde_json::to_string)
                .collect::<Result<_, _>>()?;
            Ok(lines.join("\n"))
        }
        Format::Yaml => Ok(serde_yaml::to_string(data)?),
    }
}

/// 現在時刻の UTC ISO8601 文字列（TS `new Date().toISOString()` 相当）。
/// `2026-07-14T12:34:56.789Z` 形式。
fn now_iso8601() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detect_format_by_extension() {
        assert_eq!(detect_format("a.json"), Format::Json);
        assert_eq!(detect_format("a.JSON"), Format::Json); // 大文字小文字無視
        assert_eq!(detect_format("a.jsonl"), Format::Jsonl);
        assert_eq!(detect_format("a.jsonc"), Format::Jsonc);
        assert_eq!(detect_format("a.yaml"), Format::Yaml);
        assert_eq!(detect_format("a.yml"), Format::Yaml);
        assert_eq!(detect_format("a.txt"), Format::Json); // 未知拡張子は json
        assert_eq!(detect_format("noext"), Format::Json); // 拡張子無しも json
    }

    #[test]
    fn parse_json() {
        let v = parse_format_string(r#"{"key": "value"}"#, Format::Json).unwrap();
        assert_eq!(v, json!({"key": "value"}));
    }

    #[test]
    fn parse_jsonc_with_comments_and_trailing_comma() {
        let content = r#"{
  // 行コメント
  "a": 1,
  "b": 2, /* ブロックコメント */
}"#;
        let v = parse_format_string(content, Format::Jsonc).unwrap();
        assert_eq!(v, json!({"a": 1, "b": 2}));
    }

    #[test]
    fn parse_jsonl_to_array() {
        let content = "{\"a\":1}\n{\"b\":2}\n";
        let v = parse_format_string(content, Format::Jsonl).unwrap();
        assert_eq!(v, json!([{"a": 1}, {"b": 2}]));
    }

    #[test]
    fn parse_jsonl_skips_blank_lines() {
        let content = "{\"a\":1}\n\n  \n{\"b\":2}\n";
        let v = parse_format_string(content, Format::Jsonl).unwrap();
        assert_eq!(v, json!([{"a": 1}, {"b": 2}]));
    }

    #[test]
    fn parse_yaml() {
        let content = "key: value\nnum: 42";
        let v = parse_format_string(content, Format::Yaml).unwrap();
        assert_eq!(v, json!({"key": "value", "num": 42}));
    }

    #[test]
    fn format_json_pretty_two_space() {
        let data = json!({"b": 2, "a": 1});
        let out = format_output(&data, Format::Json).unwrap();
        assert!(out.contains("\n  \""));
        // pretty 出力がパース round-trip できる
        let round: Value = serde_json::from_str(&out).unwrap();
        assert_eq!(round, data);
    }

    #[test]
    fn format_jsonc_has_generated_header() {
        let data = json!({"a": 1});
        let out = format_output(&data, Format::Jsonc).unwrap();
        assert!(out.starts_with("// Generated at "));
        // タイムスタンプは非決定だが ISO8601 Z 形式
        assert!(out.contains("Z\n"));
        // ヘッダ以降は pretty JSON
        let body = out.split_once('\n').unwrap().1;
        let _: Value = serde_json::from_str(body).unwrap();
    }

    #[test]
    fn format_jsonl_compact_no_spaces() {
        // TS golden: formatOutput([{a:1},{b:2}], jsonl) === '{"a":1}\n{"b":2}'
        let data = json!([{"a": 1}, {"b": 2}]);
        let out = format_output(&data, Format::Jsonl).unwrap();
        assert_eq!(out, "{\"a\":1}\n{\"b\":2}");
    }

    #[test]
    fn format_jsonl_non_array_wraps_single() {
        let data = json!({"a": 1});
        let out = format_output(&data, Format::Jsonl).unwrap();
        assert_eq!(out, "{\"a\":1}");
    }

    #[test]
    fn format_yaml_round_trip() {
        let data = json!({"key": "value", "num": 42});
        let out = format_output(&data, Format::Yaml).unwrap();
        let parsed = parse_format_string(&out, Format::Yaml).unwrap();
        assert_eq!(parsed, data);
    }
}
