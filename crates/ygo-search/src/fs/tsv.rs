//! TSV → DTO 読込。TS `faq-loader.ts`（位置ベースマッピング）の Rust 移植。
//!
//! TSV 仕様（TS 共通）: タブ区切り・クォート処理なし・1行目ヘッダ・
//! リテラル `\n`（バックスラッシュ+n）→ 改行アンエスケープ。

use std::path::Path;

use crate::types::card::{
    Attribute, Card, CardDetail, CardType, LevelType, Race, SpellEffectType, TrapEffectType,
};
use crate::types::faq::FAQRecord;

use super::{cache, FsError};

// ===========================================================================
// enum 変換ヘルパ（Layer A は触らず fs 内に局所化）
// cardType のみ Monster フォールバック（TS `isCardType ? v : 'monster'` 忠実）、
// 他は空/不正 → None（TS `parts[i] && isEnum ? v : undefined` 忠実）。
// ===========================================================================

pub(crate) fn parse_card_type(s: &str) -> CardType {
    match s {
        "spell" => CardType::Spell,
        "trap" => CardType::Trap,
        // 不正/空 → Monster（必須列のためフォールバック）
        _ => CardType::Monster,
    }
}

pub(crate) fn parse_attribute(s: &str) -> Option<Attribute> {
    match s {
        "dark" => Some(Attribute::Dark),
        "divine" => Some(Attribute::Divine),
        "earth" => Some(Attribute::Earth),
        "fire" => Some(Attribute::Fire),
        "light" => Some(Attribute::Light),
        "water" => Some(Attribute::Water),
        "wind" => Some(Attribute::Wind),
        _ => None,
    }
}

pub(crate) fn parse_level_type(s: &str) -> Option<LevelType> {
    match s {
        "level" => Some(LevelType::Level),
        "rank" => Some(LevelType::Rank),
        "link" => Some(LevelType::Link),
        _ => None,
    }
}

pub(crate) fn parse_race(s: &str) -> Option<Race> {
    match s {
        "aqua" => Some(Race::Aqua),
        "beast" => Some(Race::Beast),
        "beastwarrior" => Some(Race::BeastWarrior),
        "creatorgod" => Some(Race::CreatorGod),
        "cyberse" => Some(Race::Cyberse),
        "dinosaur" => Some(Race::Dinosaur),
        "divine" => Some(Race::Divine),
        "dragon" => Some(Race::Dragon),
        "fairy" => Some(Race::Fairy),
        "fiend" => Some(Race::Fiend),
        "fish" => Some(Race::Fish),
        "illusion" => Some(Race::Illusion),
        "insect" => Some(Race::Insect),
        "machine" => Some(Race::Machine),
        "plant" => Some(Race::Plant),
        "psychic" => Some(Race::Psychic),
        "pyro" => Some(Race::Pyro),
        "reptile" => Some(Race::Reptile),
        "rock" => Some(Race::Rock),
        "seaserpent" => Some(Race::SeaSerpent),
        "spellcaster" => Some(Race::Spellcaster),
        "thunder" => Some(Race::Thunder),
        "warrior" => Some(Race::Warrior),
        "windbeast" => Some(Race::WindBeast),
        "wyrm" => Some(Race::Wyrm),
        "zombie" => Some(Race::Zombie),
        _ => None,
    }
}

pub(crate) fn parse_spell_effect_type(s: &str) -> Option<SpellEffectType> {
    match s {
        "normal" => Some(SpellEffectType::Normal),
        // schema.md 契約は `quick`（converter.ts の `quickPlay` と不一致→M0-T3 で `quick` に確定）
        "quick" => Some(SpellEffectType::QuickPlay),
        "continuous" => Some(SpellEffectType::Continuous),
        "equip" => Some(SpellEffectType::Equip),
        "field" => Some(SpellEffectType::Field),
        "ritual" => Some(SpellEffectType::Ritual),
        _ => None,
    }
}

pub(crate) fn parse_trap_effect_type(s: &str) -> Option<TrapEffectType> {
    match s {
        "normal" => Some(TrapEffectType::Normal),
        "continuous" => Some(TrapEffectType::Continuous),
        "counter" => Some(TrapEffectType::Counter),
        _ => None,
    }
}

// ===========================================================================
// private フィールドヘルパ
// ===========================================================================

/// i 番目フィールド（None/範囲外 → ""）。TS `parts[i] === undefined ? ''`。
fn col(rec: &csv::StringRecord, i: usize) -> &str {
    rec.get(i).unwrap_or("")
}

/// Optional フィールド（None/空 → None）。TS `parts[i] || undefined`。
fn opt(rec: &csv::StringRecord, i: usize) -> Option<String> {
    match rec.get(i) {
        Some(s) if !s.is_empty() => Some(s.to_string()),
        _ => None,
    }
}

/// リテラル `\n`（バックスラッシュ+n）→ 改行。
fn unescape_nl(s: &str) -> String {
    s.replace("\\n", "\n")
}

/// Optional + `\n` アンエスケープ。
fn opt_unescape(rec: &csv::StringRecord, i: usize) -> Option<String> {
    opt(rec, i).map(|s| unescape_nl(&s))
}

/// 実質ブランク行か（全フィールド空）。空行スキップ用。
fn is_blank(rec: &csv::StringRecord) -> bool {
    rec.iter().all(|f| f.is_empty())
}

/// タブ区切り・クォート無効・可変長許容の TSV リーダを構築。
fn tsv_reader(path: &Path, file: &'static str) -> Result<csv::Reader<std::fs::File>, FsError> {
    csv::ReaderBuilder::new()
        .delimiter(b'\t')
        .has_headers(true)
        .quoting(false)
        .flexible(true)
        .from_path(path)
        .map_err(|source| FsError::Parse { file, source })
}

// ===========================================================================
// read_* : 純粋パース（グローバル状態なし・テスト/M2-T3 から直接利用）
// ===========================================================================

/// 汎用 TSV テーブル（ヘッダ + データ行）。jsonl 変換（M2-T4）等の動的カラム処理用。
///
/// TS `converter.ts` の `parseTsvLine` 相当: ヘッダ順を保持し、各セル値は
/// リテラル `\n` を改行へアンエスケープ済み。列不足は `""` 補完、過剰列は切り捨て。
#[derive(Debug, Clone)]
pub struct TsvTable {
    /// 1 行目のヘッダ（タブ区切り）。
    pub headers: Vec<String>,
    /// 2 行目以降のデータ行（各要素は `headers` と同じ列順）。
    pub rows: Vec<Vec<String>>,
}

impl TsvTable {
    /// カラム名 → 列インデックス（存在しない場合は `None`）。
    pub fn col_index(&self, name: &str) -> Option<usize> {
        self.headers.iter().position(|h| h == name)
    }

    /// `row` の `name` カラム値（存在しないカラム/範囲外は `""`）。
    pub fn cell<'a>(&self, row: &'a [String], name: &str) -> &'a str {
        match self.col_index(name) {
            Some(i) => row.get(i).map(|s| s.as_str()).unwrap_or(""),
            None => "",
        }
    }
}

/// 任意の TSV ファイルを [`TsvTable`] として読み込む（`has_headers`・`flexible`）。
///
/// 空行（全フィールド空）はスキップ。csv クレートの `headers()` で1行目を取得する。
pub fn read_tsv_table(path: &Path) -> Result<TsvTable, FsError> {
    const FILE: &str = "tsv";
    let mut rdr = tsv_reader(path, FILE)?;
    let headers: Vec<String> = rdr
        .headers()
        .map_err(|source| FsError::Parse { file: FILE, source })?
        .iter()
        .map(String::from)
        .collect();
    let ncol = headers.len();
    let mut rows = Vec::new();
    for rec in rdr.records() {
        let rec = rec.map_err(|source| FsError::Parse { file: FILE, source })?;
        if is_blank(&rec) {
            continue;
        }
        let row: Vec<String> = (0..ncol).map(|i| unescape_nl(col(&rec, i))).collect();
        rows.push(row);
    }
    Ok(TsvTable { headers, rows })
}

/// cards-all.tsv（21列）→ Vec<Card>。
pub fn read_cards(path: &Path) -> Result<Vec<Card>, FsError> {
    const FILE: &str = "cards-all.tsv";
    let mut rdr = tsv_reader(path, FILE)?;
    let mut cards = Vec::new();
    for rec in rdr.records() {
        let rec = rec.map_err(|source| FsError::Parse { file: FILE, source })?;
        if is_blank(&rec) {
            continue;
        }
        cards.push(Card {
            card_type: parse_card_type(col(&rec, 0)),
            name: col(&rec, 1).to_string(),
            name_modified: col(&rec, 2).to_string(),
            ruby: col(&rec, 3).to_string(),
            card_id: col(&rec, 4).to_string(),
            ciid: opt(&rec, 5),
            imgs: opt(&rec, 6),
            text: opt_unescape(&rec, 7),
            attribute: parse_attribute(col(&rec, 8)),
            level_type: parse_level_type(col(&rec, 9)),
            level_value: opt(&rec, 10),
            race: parse_race(col(&rec, 11)),
            monster_types: opt(&rec, 12),
            atk: opt(&rec, 13),
            def: opt(&rec, 14),
            link_markers: opt(&rec, 15),
            pendulum_scale: opt(&rec, 16),
            pendulum_text: opt_unescape(&rec, 17),
            is_extra_deck: opt(&rec, 18),
            spell_effect_type: parse_spell_effect_type(col(&rec, 19)),
            trap_effect_type: parse_trap_effect_type(col(&rec, 20)),
        });
    }
    Ok(cards)
}

/// detail-all.tsv（6列）→ Vec<CardDetail>。
pub fn read_card_details(path: &Path) -> Result<Vec<CardDetail>, FsError> {
    const FILE: &str = "detail-all.tsv";
    let mut rdr = tsv_reader(path, FILE)?;
    let mut details = Vec::new();
    for rec in rdr.records() {
        let rec = rec.map_err(|source| FsError::Parse { file: FILE, source })?;
        if is_blank(&rec) {
            continue;
        }
        details.push(CardDetail {
            card_id: col(&rec, 0).to_string(),
            card_name: col(&rec, 1).to_string(),
            supplement_info: opt_unescape(&rec, 2),
            supplement_date: opt(&rec, 3),
            pendulum_supplement_info: opt_unescape(&rec, 4),
            pendulum_supplement_date: opt(&rec, 5),
        });
    }
    Ok(details)
}

/// faq-all.tsv（4列）→ Vec<FAQRecord>。faqId 変換不可行はスキップ。
pub fn read_faqs(path: &Path) -> Result<Vec<FAQRecord>, FsError> {
    const FILE: &str = "faq-all.tsv";
    let mut rdr = tsv_reader(path, FILE)?;
    let mut faqs = Vec::new();
    for rec in rdr.records() {
        let rec = rec.map_err(|source| FsError::Parse { file: FILE, source })?;
        if is_blank(&rec) {
            continue;
        }
        let faq_id = match col(&rec, 0).parse::<u32>() {
            Ok(id) => id,
            Err(_) => {
                eprintln!(
                    "warn: faq-all.tsv: faqId の数値変換に失敗、行をスキップします: {}",
                    col(&rec, 0)
                );
                continue;
            }
        };
        faqs.push(FAQRecord {
            faq_id,
            question: unescape_nl(col(&rec, 1)),
            answer: unescape_nl(col(&rec, 2)),
            updated_at: col(&rec, 3).to_string(),
        });
    }
    Ok(faqs)
}

// ===========================================================================
// load_* : キャッシュ経由の公開エントリ
// ===========================================================================

/// cards-all.tsv をロード（キャッシュ対応）。
pub fn load_cards() -> Result<Vec<Card>, FsError> {
    cache::load_cards_cached(|| load_from_path("cards-all.tsv", read_cards))
}

/// detail-all.tsv をロード（キャッシュ対応）。
pub fn load_card_details() -> Result<Vec<CardDetail>, FsError> {
    cache::load_details_cached(|| load_from_path("detail-all.tsv", read_card_details))
}

/// faq-all.tsv をロード（キャッシュ対応）。
pub fn load_faqs() -> Result<Vec<FAQRecord>, FsError> {
    cache::load_faqs_cached(|| load_from_path("faq-all.tsv", read_faqs))
}

/// パス解決 → 存在チェック → reader 呼出。
fn load_from_path<T>(
    filename: &str,
    reader: fn(&Path) -> Result<Vec<T>, FsError>,
) -> Result<Vec<T>, FsError> {
    let path = super::tsv_path(filename)?;
    if !path.exists() {
        return Err(FsError::FileNotFound(path.display().to_string()));
    }
    reader(&path)
}
