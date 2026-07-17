//! フォーマット IO（TS `src/lib/format-converter.ts` の `parseFormatFile`/`convertFormatFile`）。
//!
//! [`crate::format`] の純粋関数（`detect_format`/`parse_format_string`/`format_output`）と
//! `std::fs` を結ぶファイル IO 層。`fs` + `format` 両 feature が必要。

use std::path::Path;

use crate::format::{detect_format, format_output, parse_format_string, FormatError};
use crate::types::Format;

use serde_json::Value;

/// TS `parseFormatFile`。ファイルを読み込んで指定フォーマットでパースする。
pub fn parse_format_file(path: &Path, format: Format) -> Result<Value, FormatError> {
    let content = std::fs::read_to_string(path)?;
    parse_format_string(&content, format)
}

/// TS `convertFormatFile`。入出力の拡張子から各フォーマットを検出し変換して書き出す。
///
/// 出力ディレクトリは `mkdir -p` 相当で作成する。
pub fn convert_format_file(input: &Path, output: &Path) -> Result<(), FormatError> {
    let input_format = detect_format(input.to_str().unwrap_or(""));
    let output_format = detect_format(output.to_str().unwrap_or(""));

    let data = parse_format_file(input, input_format)?;
    let out_str = format_output(&data, output_format)?;

    if let Some(parent) = output.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    std::fs::write(output, out_str)?;
    Ok(())
}
