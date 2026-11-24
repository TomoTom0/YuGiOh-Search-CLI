//! `seek_cards`（TS `src/lib/seek-cards.ts` の Rust 移植）。
//!
//! cards-all.tsv をキャッシュ経由で読み込み、ランダム/範囲/先頭 N 件の選択を行う。
//!
//! # TS との差異（構造化戻り値に起因）
//! - 戻り値は構造化 [`Vec<Card>`]。TS は `Record<string, string>[]`（動的カラム）だが、
//!   Rust 版は [`super::search::search_cards`] と同様に固定スキーマの `Card` を返す。
//! - `cols` / `colAll`（列投影）と detail-all.tsv のマージは、TS と同一の意味論を持つ
//!   [`seek_cards_projected`]（動的レコード `Vec<serde_json::Value>` を返す）が提供する。
//!   型付き [`seek_cards`] は全フィールドの `Card` を返す設計として残る（意図した形状差）。

use std::collections::HashMap;

use rand::seq::SliceRandom;
use serde_json::{Map, Value};

use crate::types::options::SeekCardsOptions;
use crate::types::Card;

use super::{load_cards, read_tsv_table, FsError};

/// `seekCards(opts) -> Card[]`（TS `seek-cards.ts`）。
///
/// 既定値: `max=10`, `random=true`, `all=false`。
/// - `range=[start,end]`: cardId 範囲フィルタ（両端含む・数値化不可行は除外）。
/// - `all=true`: 範囲内の全カードを返す（`range` 必須・`max` 無視）。`range` 無しはエラー。
/// - `random=true`: 重複なしランダム抽出（`min(max, len)` 件）。
/// - `random=false`: 先頭 N 件（TSV 行順）。
pub fn seek_cards(opts: &SeekCardsOptions) -> Result<Vec<Card>, FsError> {
    let max = opts.max.unwrap_or(10) as usize;
    let random = opts.random.unwrap_or(true);
    let all = opts.all.unwrap_or(false);

    // TS: throw new Error('--all requires --range')
    if all && opts.range.is_none() {
        return Err(FsError::InvalidOption("--all requires --range".to_string()));
    }

    let mut cards = load_cards()?;

    // 範囲フィルタ（TS: parseInt(card.cardId) で isNaN/範囲外を skip）
    if let Some([start, end]) = opts.range {
        cards.retain(|c| match c.card_id.parse::<u32>() {
            Ok(id) => id >= start && id <= end,
            Err(_) => false,
        });
    }

    let selected: Vec<Card> = if all {
        cards
    } else if random {
        // 重複なしランダム抽出（TS は Set + Math.random、本実装は rand の choose_multiple）
        let count = max.min(cards.len());
        let mut rng = rand::thread_rng();
        cards.choose_multiple(&mut rng, count).cloned().collect()
    } else {
        // 先頭 N 件（TSV 行順）
        cards.into_iter().take(max).collect()
    };

    Ok(selected)
}

/// TS `parseInt` 相当の数値化: 先頭の空白・符号・10 進数字プレフィクスを解析する。
/// 数字が無い場合は `NaN`（[`Option::None`]）として扱う。
fn parse_int(s: &str) -> Option<f64> {
    let t = s.trim_start();
    let (neg, digits_start) = if t.starts_with('-') {
        (true, 1)
    } else if t.starts_with('+') {
        (false, 1)
    } else {
        (false, 0)
    };
    let digits: String = t[digits_start..]
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    if digits.is_empty() {
        return None;
    }
    // 桁数が大きく f64 に載らない場合は inf（範囲比較で除外される）
    let v = digits.parse::<f64>().unwrap_or(f64::INFINITY);
    Some(if neg { -v } else { v })
}

/// `seekCards(opts)` の動的レコード版（TS `seek-cards.ts` と同一の意味論）。
///
/// [`seek_cards`] と異なり cards-all.tsv を毎回生読込（キャッシュ未使用）し、
/// `cols` / `colAll` による列投影と detail-all.tsv の cardId マージ（既存キーは
/// 上書きしない）を行い、`Vec<serde_json::Value>`（Object・全値は文字列・キー順は
/// `effectiveCols` 順）を返す。
///
/// 既定値: `max=10`, `random=true`, `all=false`, `cols=["cardId", "name"]`, `colAll=false`。
/// - `all=true && range` 無しは [`FsError::InvalidOption`]（TS `throw` と同一文言）。
/// - `range=[start,end]`: cardId を TS `parseInt` 意味論（前方一致解析・`NaN` は除外）で
///   数値化し `[start, end]` 両端含む。型付き [`seek_cards`] の `u32` 完全パースより TS 忠実。
/// - detail-all.tsv は存在する場合のみ読む（無ければマージ無しで続行。TS `existsSync` 分岐）。
/// - `colAll=true`: effectiveCols は「cards ヘッダ全列 + detail ヘッダのうち cards に無いもの」
///   （detail 無しの場合は cards ヘッダのみ）。
/// - 選択（all / 重複なしランダム / 先頭 N）の意味論は [`seek_cards`] と同一。
pub fn seek_cards_projected(opts: &SeekCardsOptions) -> Result<Vec<Value>, FsError> {
    let max = opts.max.unwrap_or(10) as usize;
    let random = opts.random.unwrap_or(true);
    let all = opts.all.unwrap_or(false);

    // TS: throw new Error('--all requires --range')
    if all && opts.range.is_none() {
        return Err(FsError::InvalidOption("--all requires --range".to_string()));
    }

    // パス解決 → 存在チェック（`load_from_path` の流儀）
    let cards_path = super::tsv_path("cards-all.tsv")?;
    if !cards_path.exists() {
        return Err(FsError::FileNotFound(cards_path.display().to_string()));
    }
    let table = read_tsv_table(&cards_path)?;

    // detail-all.tsv は存在する場合のみ読む（TS existsSync 分岐と同一）
    let detail_path = super::tsv_path("detail-all.tsv")?;
    let detail = if detail_path.exists() {
        Some(read_tsv_table(&detail_path)?)
    } else {
        None
    };

    // 各行を「ヘッダ名 → 値」の順序付きマップへ（preserve_order により挿入順保持）。
    // セル値は read_tsv_table が全フィールドのリテラル backslash-n を改行へアンエスケープ済み
    // （TS の全フィールド置換と同一）。
    let mut records: Vec<Map<String, Value>> = table
        .rows
        .iter()
        .map(|row| {
            let mut m = Map::new();
            for (i, h) in table.headers.iter().enumerate() {
                m.insert(
                    h.clone(),
                    Value::String(row.get(i).cloned().unwrap_or_default()),
                );
            }
            m
        })
        .collect();

    // detail 行を cardId でマップ化（同一 cardId は後勝ち = TS Map.set と同一）
    let detail_map: HashMap<String, Map<String, Value>> = match &detail {
        Some(d) => d
            .rows
            .iter()
            .filter_map(|row| {
                let id = d.cell(row, "cardId");
                if id.is_empty() {
                    return None;
                }
                let mut m = Map::new();
                for (i, h) in d.headers.iter().enumerate() {
                    m.insert(
                        h.clone(),
                        Value::String(row.get(i).cloned().unwrap_or_default()),
                    );
                }
                Some((id.to_string(), m))
            })
            .collect(),
        None => HashMap::new(),
    };

    // マージ: カード側に未存在のキーだけ追加（既存キーは上書きしない・TS hasOwnProperty 分岐と同一）
    for card in &mut records {
        if let Some(id) = card.get("cardId").and_then(Value::as_str) {
            if let Some(d) = detail_map.get(id) {
                for (k, v) in d {
                    card.entry(k.clone()).or_insert(v.clone());
                }
            }
        }
    }

    // effectiveCols（TS と同一）
    let effective_cols: Vec<String> = if opts.col_all.unwrap_or(false) {
        match &detail {
            // cards ヘッダ順 + detail ヘッダのうち cards に無いもの（TS Set の挿入順）
            Some(d) => {
                let mut cols = table.headers.clone();
                for h in &d.headers {
                    if !cols.contains(h) {
                        cols.push(h.clone());
                    }
                }
                cols
            }
            None => table.headers.clone(),
        }
    } else {
        opts.cols
            .clone()
            .unwrap_or_else(|| vec!["cardId".to_string(), "name".to_string()])
    };

    // 範囲フィルタ（TS: parseInt(card.cardId) で isNaN/範囲外を skip）
    if let Some([start, end]) = opts.range {
        records.retain(|m| match m.get("cardId").and_then(Value::as_str) {
            Some(id) => match parse_int(id) {
                Some(v) => v >= start as f64 && v <= end as f64,
                None => false,
            },
            None => false,
        });
    }

    // 選択（TS と同一: all / 重複なしランダム min(max, len) / 先頭 N）
    let selected: Vec<&Map<String, Value>> = if all {
        records.iter().collect()
    } else if random {
        let count = max.min(records.len());
        let mut rng = rand::thread_rng();
        records.choose_multiple(&mut rng, count).collect()
    } else {
        records.iter().take(max).collect()
    };

    // 投影: effectiveCols のキー順で Object を組み立て、欠けた列は空文字で埋める
    // （TS の card[col] || 空文字 フォールバックと同一）
    Ok(selected
        .into_iter()
        .map(|card| {
            let mut obj = Map::new();
            for col in &effective_cols {
                let v = card.get(col).and_then(Value::as_str).unwrap_or("");
                obj.insert(col.clone(), Value::String(v.to_string()));
            }
            Value::Object(obj)
        })
        .collect())
}
