//! jsonl 変換（TS `src/lib/vector/converter.ts` の Rust 移植）。
//!
//! TSV / JSON / YAML を [`VectorRecord`]（`{ id, text, metadata }`）の JSONL へ変換する。
//! embedding（ベクトル）計算は行わない（M3 `index_from_jsonl` の入力）。
//!
//! - `convert_cards_to_jsonl` / `convert_faqs_to_jsonl`: TSV → JSONL（`fs` feature）
//! - `convert_generic_to_jsonl`: json/yaml/jsonl/tsv/csv → JSONL（`fs` + `format` feature）
//!
//! TS との差異:
//! - 重複 cardId の扱いは簡略化（実データでは重複無しを前提）。TS は Map で後勝ち + uniq。
//! - `metadata` のキー順序は TS（挿入順）と厳密一致を保証しない（`serde_json::Map` はソート順）。
//!   意味論的同等。完全一致が必要なら `serde_json` の `preserve_order` feature 検討。

use std::collections::HashMap;
use std::path::Path;

use serde_json::{Map, Value};

#[cfg(feature = "format")]
use crate::types::options::GenericConversionOptions;
use crate::types::VectorRecord;

use super::tsv::{read_tsv_table, TsvTable};
use super::FsError;

// =============================================================================
// 共通ヘルパ
// =============================================================================

/// TS `parseInt(s, 10)` 相当（数値化不可は `null`。TS `NaN` → JSON `null` に一致）。
fn parse_int_json(s: &str) -> Value {
    match s.trim().parse::<i64>() {
        Ok(n) => Value::from(n),
        Err(_) => Value::Null,
    }
}

/// レコード列を JSONL（各行 compact JSON・末尾改行1つ）として書き出す。
fn write_jsonl(path: &Path, records: &[VectorRecord]) -> Result<(), FsError> {
    let lines: Vec<String> = records
        .iter()
        .map(serde_json::to_string)
        .collect::<Result<_, _>>()?;
    let body = format!("{}\n", lines.join("\n"));
    std::fs::write(path, body)?;
    Ok(())
}

// =============================================================================
// カード変換（`src/lib/vector/converter.ts` convertCardToVectorRecord 等）
// =============================================================================

/// monsterTypes の JSON 配列をパース（失敗/空は空 Vec）。
fn parse_str_array(s: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(s).unwrap_or_default()
}

/// TS `formatCardType`。カード種別の日本語表示。
fn format_card_type(card_type: &str, monster_types: &str, spell_effect_type: &str, trap_effect_type: &str) -> String {
    if card_type == "monster" {
        let types = parse_str_array(monster_types);
        if !types.is_empty() {
            let mapped: Vec<String> = types
                .iter()
                .map(|t| {
                    match t.as_str() {
                        "normal" => "通常",
                        "effect" => "効果",
                        "fusion" => "融合",
                        "ritual" => "儀式",
                        "synchro" => "シンクロ",
                        "xyz" => "エクシーズ",
                        "pendulum" => "ペンデュラム",
                        "link" => "リンク",
                        "tuner" => "チューナー",
                        "spirit" => "スピリット",
                        "union" => "ユニオン",
                        "gemini" => "デュアル",
                        "flip" => "リバース",
                        "toon" => "トゥーン",
                        other => other,
                    }
                    .to_string()
                })
                .collect();
            return format!("{}モンスター", mapped.join("・"));
        }
        return "モンスター".to_string();
    } else if card_type == "spell" {
        let s = match spell_effect_type {
            "normal" => "通常",
            "continuous" => "永続",
            "equip" => "装備",
            "field" => "フィールド",
            "quick" => "速攻",
            "ritual" => "儀式",
            _ => "",
        };
        return format!("{}魔法", s);
    } else if card_type == "trap" {
        let s = match trap_effect_type {
            "normal" => "通常",
            "continuous" => "永続",
            "counter" => "カウンター",
            _ => "",
        };
        return format!("{}罠", s);
    }
    card_type.to_string()
}

/// TS `formatMonsterStatus`。モンスターステータス（属性 / 種族 / 星ランクリンク / 攻守）。
fn format_monster_status(table: &TsvTable, row: &[String]) -> String {
    let mut parts: Vec<String> = Vec::new();
    let attribute = table.cell(row, "attribute");
    if !attribute.is_empty() {
        parts.push(attribute.to_string());
    }
    let race = table.cell(row, "race");
    if !race.is_empty() {
        parts.push(race.to_string());
    }
    let level_type = table.cell(row, "levelType");
    let level_value = table.cell(row, "levelValue");
    if !level_type.is_empty() && !level_value.is_empty() {
        let prefix = match level_type {
            "level" => "星",
            "rank" => "ランク",
            "link" => "リンク",
            other => other,
        };
        parts.push(format!("{}{}", prefix, level_value));
    }
    let atk = table.cell(row, "atk");
    let def = table.cell(row, "def");
    if !atk.is_empty() && !def.is_empty() {
        parts.push(format!("攻{}", atk));
        parts.push(format!("守{}", def));
    }
    parts.join(" / ")
}

/// TS `convertCardToVectorRecord`。1 カード + 補足 → [`VectorRecord`]。
fn convert_card(
    table: &TsvTable,
    row: &[String],
    detail_table: &TsvTable,
    detail_row: Option<&Vec<String>>,
) -> VectorRecord {
    let name = table.cell(row, "name");
    let card_id = table.cell(row, "cardId");
    let card_type = table.cell(row, "cardType");
    let monster_types = table.cell(row, "monsterTypes");
    let spell_effect_type = table.cell(row, "spellEffectType");
    let trap_effect_type = table.cell(row, "trapEffectType");
    let text = table.cell(row, "text");
    let pendulum_text = table.cell(row, "pendulumText");

    let mut text_parts: Vec<String> = Vec::new();
    text_parts.push(format!("【カード名】 {}", name));
    let card_type_str = format_card_type(card_type, monster_types, spell_effect_type, trap_effect_type);
    text_parts.push(format!("【分類】 {}", card_type_str));

    if card_type == "monster" {
        let status = format_monster_status(table, row);
        if !status.is_empty() {
            text_parts.push(format!("【ステータス】 {}", status));
        }
    }
    if !text.is_empty() {
        text_parts.push(format!("【テキスト】\n{}", text));
    }
    if !pendulum_text.is_empty() && pendulum_text != "false" {
        text_parts.push(format!("【Pスケール効果】\n{}", pendulum_text));
    }
    if let Some(dr) = detail_row {
        let supp = detail_table.cell(dr, "supplementInfo");
        if !supp.is_empty() {
            text_parts.push(format!("【補足】\n{}", supp));
        }
        let psupp = detail_table.cell(dr, "pendulumSupplementInfo");
        if !psupp.is_empty() {
            text_parts.push(format!("【Pスケール補足】\n{}", psupp));
        }
    }

    let mut metadata = Map::new();
    metadata.insert("cardId".into(), parse_int_json(card_id));
    metadata.insert("cardType".into(), Value::String(card_type.to_string()));
    if card_type == "monster" {
        let atk = table.cell(row, "atk");
        if !atk.is_empty() {
            metadata.insert("atk".into(), parse_int_json(atk));
        }
        let def = table.cell(row, "def");
        if !def.is_empty() {
            metadata.insert("def".into(), parse_int_json(def));
        }
        let attribute = table.cell(row, "attribute");
        if !attribute.is_empty() {
            metadata.insert("attribute".into(), Value::String(attribute.to_string()));
        }
        let race = table.cell(row, "race");
        if !race.is_empty() {
            metadata.insert("race".into(), Value::String(race.to_string()));
        }
        let level_type = table.cell(row, "levelType");
        if !level_type.is_empty() {
            metadata.insert("levelType".into(), Value::String(level_type.to_string()));
        }
        let level_value = table.cell(row, "levelValue");
        if !level_value.is_empty() {
            metadata.insert("levelValue".into(), parse_int_json(level_value));
        }
    } else if card_type == "spell" {
        let s = table.cell(row, "spellEffectType");
        if !s.is_empty() {
            metadata.insert("spellEffectType".into(), Value::String(s.to_string()));
        }
    } else if card_type == "trap" {
        let t = table.cell(row, "trapEffectType");
        if !t.is_empty() {
            metadata.insert("trapEffectType".into(), Value::String(t.to_string()));
        }
    }

    VectorRecord {
        id: format!("card-{}", card_id),
        text: text_parts.join("\n"),
        metadata: Value::Object(metadata),
    }
}

/// TS `convertCardsToJsonl`。cards + detail TSV → JSONL。戻り値は件数。
pub fn convert_cards_to_jsonl(
    cards_tsv: &Path,
    detail_tsv: &Path,
    output: &Path,
) -> Result<usize, FsError> {
    let cards = read_tsv_table(cards_tsv)?;
    let details = read_tsv_table(detail_tsv)?;

    // detailMap: cardId → 行インデックス（後勝ち）
    let mut detail_map: HashMap<String, usize> = HashMap::new();
    if let Some(di) = details.col_index("cardId") {
        for (i, row) in details.rows.iter().enumerate() {
            if let Some(cid) = row.get(di) {
                detail_map.insert(cid.clone(), i);
            }
        }
    }

    let mut records = Vec::with_capacity(cards.rows.len());
    for row in &cards.rows {
        let card_id = cards.cell(row, "cardId");
        let detail_row = detail_map.get(card_id).map(|&i| &details.rows[i]);
        records.push(convert_card(&cards, row, &details, detail_row));
    }

    write_jsonl(output, &records)?;
    Ok(records.len())
}

// =============================================================================
// FAQ 変換
// =============================================================================

/// TS `convertFaqToVectorRecord`。1 FAQ → [`VectorRecord`]。
fn convert_faq(table: &TsvTable, row: &[String]) -> VectorRecord {
    let faq_id = table.cell(row, "faqId");
    let question = table.cell(row, "question");
    let answer = table.cell(row, "answer");
    let updated_at = table.cell(row, "updatedAt");

    let mut metadata = Map::new();
    metadata.insert("faqId".into(), parse_int_json(faq_id));
    if !updated_at.is_empty() {
        metadata.insert("updatedAt".into(), Value::String(updated_at.to_string()));
    }

    VectorRecord {
        id: format!("faq-{}", faq_id),
        text: format!("# 質問\n{}\n\n# 回答\n{}", question, answer),
        metadata: Value::Object(metadata),
    }
}

/// TS `convertFaqsToJsonl`。FAQ TSV → JSONL。戻り値は件数。
pub fn convert_faqs_to_jsonl(tsv_path: &Path, output: &Path) -> Result<usize, FsError> {
    let table = read_tsv_table(tsv_path)?;
    let records: Vec<VectorRecord> = table.rows.iter().map(|row| convert_faq(&table, row)).collect();
    write_jsonl(output, &records)?;
    Ok(records.len())
}

// =============================================================================
// 汎用変換（json/yaml/jsonl/tsv/csv）— format feature（YAML パース）に依存
// =============================================================================

#[cfg(feature = "format")]
mod generic {
    use super::*;

    /// TS `String(value)` 相当（非オブジェクト）。オブジェクト/配列は呼出側で `to_string`。
    fn value_to_string(v: &Value) -> String {
        match v {
            Value::String(s) => s.clone(),
            Value::Null => "null".to_string(),
            Value::Bool(b) => b.to_string(),
            Value::Number(n) => n.to_string(),
            _ => serde_json::to_string(v).unwrap_or_default(),
        }
    }

    /// TS `detectFormat`（generic 版）。yaml/jsonl/json/tsv/csv、未知はエラー。
    fn detect_generic_format(path: &Path) -> Result<&'static str, FsError> {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase());
        Ok(match ext.as_deref() {
            Some("yml") | Some("yaml") => "yaml",
            Some("jsonl") => "jsonl",
            Some("json") => "json",
            Some("tsv") => "tsv",
            Some("csv") => "csv",
            other => {
                return Err(FsError::InvalidOption(format!(
                    "Unsupported file format: {:?}",
                    other.unwrap_or("")
                )));
            }
        })
    }

    /// TS `extractRecordsFromObject`。`{id,title,text}` を持つオブジェクトを再帰抽出。
    fn extract_records(value: &Value, path: &[String], out: &mut Vec<Value>) {
        if let Value::Object(map) = value {
            if map.contains_key("id") && map.contains_key("title") && map.contains_key("text") {
                let mut rec = map.clone();
                if !path.is_empty() {
                    rec.insert("path".into(), Value::String(path.join(" > ")));
                }
                out.push(Value::Object(rec));
            }
            for (k, v) in map {
                let mut p = path.to_vec();
                p.push(k.clone());
                extract_records(v, &p, out);
            }
        } else if let Value::Array(arr) = value {
            for item in arr {
                extract_records(item, path, out);
            }
        }
    }

    /// tsv/csv をフラットレコード（ヘッダ→値の Object）の列にする。`id/title/text` 列必須。
    fn parse_delimited(content: &str, delim: char) -> Result<Vec<Value>, FsError> {
        let lines: Vec<&str> = content.trim().split('\n').collect();
        if lines.is_empty() {
            return Err(FsError::InvalidOption("file is empty".into()));
        }
        let headers: Vec<String> = lines[0]
            .split(delim)
            .map(|h| h.trim().to_string())
            .collect();
        for col in ["id", "title", "text"] {
            if !headers.iter().any(|h| h == col) {
                return Err(FsError::InvalidOption(format!(
                    "{} must have id, title, text columns",
                    if delim == '\t' { "TSV" } else { "CSV" }
                )));
            }
        }
        let mut records = Vec::new();
        for line in &lines[1..] {
            let values: Vec<String> = line.split(delim).map(|v| v.trim().to_string()).collect();
            let mut obj = Map::new();
            for (i, h) in headers.iter().enumerate() {
                obj.insert(
                    h.clone(),
                    Value::String(values.get(i).cloned().unwrap_or_default()),
                );
            }
            records.push(Value::Object(obj));
        }
        Ok(records)
    }

    /// TS `buildGenericText`。
    fn build_generic_text(
        rec: &Map<String, Value>,
        options: &GenericConversionOptions,
    ) -> Result<String, FsError> {
        let mut parts: Vec<String> = Vec::new();
        let title = rec.get("title").and_then(|v| v.as_str()).unwrap_or("");
        parts.push(format!("【{}】", title));
        if let Some(path) = rec.get("path").and_then(|v| v.as_str()) {
            if !path.is_empty() {
                parts.push(format!("【階層】\n{}", path));
            }
        }
        let text = rec.get("text").and_then(|v| v.as_str()).unwrap_or("");
        parts.push(format!("【テキスト】\n{}", text));

        let exclude = options.exclude_columns.as_ref();
        let include = options.include_columns.as_ref();
        if exclude.map_or(false, |e| !e.is_empty()) && include.is_some() {
            return Err(FsError::InvalidOption(
                "Cannot specify both excludeColumns and includeColumns".into(),
            ));
        }

        for (key, value) in rec {
            if matches!(key.as_str(), "id" | "title" | "text" | "path") {
                continue;
            }
            if let Some(inc) = include {
                if !inc.iter().any(|c| c == key) {
                    continue;
                }
            }
            if let Some(exc) = exclude {
                if exc.iter().any(|c| c == key) {
                    continue;
                }
            }
            let value_str = if value.is_object() || value.is_array() {
                serde_json::to_string(value)?
            } else {
                value_to_string(value)
            };
            parts.push(format!("【{}】\n{}", key, value_str));
        }
        Ok(parts.join("\n"))
    }

    /// TS `convertGenericRecordToVector`。
    fn convert_generic_record(
        rec: &Map<String, Value>,
        options: &GenericConversionOptions,
    ) -> Result<VectorRecord, FsError> {
        let text = build_generic_text(rec, options)?;
        let id = rec
            .get("id")
            .map(|v| {
                v.as_str()
                    .map(String::from)
                    .unwrap_or_else(|| value_to_string(v))
            })
            .unwrap_or_default();
        let mut metadata = rec.clone();
        metadata.remove("title");
        metadata.remove("text");
        metadata.remove("path");
        Ok(VectorRecord {
            id,
            text,
            metadata: Value::Object(metadata),
        })
    }

    /// TS `convertGenericToJsonl`。json/yaml/jsonl/tsv/csv → JSONL。戻り値は件数。
    pub fn convert_generic_to_jsonl(
        input: &Path,
        output: &Path,
        options: &GenericConversionOptions,
    ) -> Result<usize, FsError> {
        let format = detect_generic_format(input)?;
        let content = std::fs::read_to_string(input)?;

        let mut records: Vec<Value> = Vec::new();
        match format {
            "yaml" => {
                let data: Value = serde_yaml::from_str(&content)?;
                extract_records(&data, &[], &mut records);
            }
            "json" => {
                let data: Value = serde_json::from_str(&content)?;
                extract_records(&data, &[], &mut records);
            }
            "jsonl" => {
                for line in content.trim().split('\n') {
                    if line.trim().is_empty() {
                        continue;
                    }
                    let obj: Value = serde_json::from_str(line)?;
                    extract_records(&obj, &[], &mut records);
                }
            }
            "tsv" => records = parse_delimited(&content, '\t')?,
            "csv" => records = parse_delimited(&content, ',')?,
            _ => unreachable!(),
        }

        let vector_records: Vec<VectorRecord> = records
            .iter()
            .filter_map(|r| r.as_object())
            .map(|m| convert_generic_record(m, options))
            .collect::<Result<_, _>>()?;
        let count = vector_records.len();
        write_jsonl(output, &vector_records)?;
        Ok(count)
    }
}

#[cfg(feature = "format")]
pub use generic::convert_generic_to_jsonl;
