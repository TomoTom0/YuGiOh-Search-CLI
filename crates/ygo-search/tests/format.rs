//! フォーマット変換の integration test（format feature 必須）。
#![cfg(feature = "format")]

use serde_json::json;
use ygo_search::format::{detect_format, format_output, parse_format_string};
use ygo_search::types::Format;

#[test]
fn detect_format_various_extensions() {
    assert_eq!(detect_format("cards.json"), Format::Json);
    assert_eq!(detect_format("cards.jsonl"), Format::Jsonl);
    assert_eq!(detect_format("cards.jsonc"), Format::Jsonc);
    assert_eq!(detect_format("cards.yaml"), Format::Yaml);
    assert_eq!(detect_format("cards.yml"), Format::Yaml);
    assert_eq!(detect_format("README.md"), Format::Json);
}

#[test]
fn round_trip_json() {
    let data = json!({"name": "青眼の白龍", "id": 4007});
    let s = format_output(&data, Format::Json).unwrap();
    let back = parse_format_string(&s, Format::Json).unwrap();
    assert_eq!(back, data);
}

#[test]
fn jsonl_compact_matches_ts() {
    // TS golden (exported-functions.test.ts): compact, no spaces, exact match
    let data = json!([{"a": 1}, {"b": 2}]);
    let out = format_output(&data, Format::Jsonl).unwrap();
    assert_eq!(out, "{\"a\":1}\n{\"b\":2}");
}

#[test]
fn jsonc_parse_strips_comments() {
    let content = "// header comment\n{\"a\": 1 /* inline */, \"b\": 2,}";
    let v = parse_format_string(content, Format::Jsonc).unwrap();
    assert_eq!(v, json!({"a": 1, "b": 2}));
}

#[test]
fn yaml_round_trip() {
    let data = json!({"key": "value", "nested": {"num": 42}});
    let s = format_output(&data, Format::Yaml).unwrap();
    let back = parse_format_string(&s, Format::Yaml).unwrap();
    assert_eq!(back, data);
}
