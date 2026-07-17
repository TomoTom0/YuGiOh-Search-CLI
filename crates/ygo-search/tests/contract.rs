//! M0-T2 契約テスト: TS 公開型面と TSV カラム契約の凍結を検証する。
//!
//! - 各 fixture を対応 Rust 型へデシリアライズ → 再シリアライズし、元 JSON と構造的等価であること。
//!   camelCase キー・enum 文字列値・Optional フールドの省略が TS と一致することを保証。
//! - TSV カラム契約（`tsv-contract.json`）のカラム構成が schema.md 期待値と一致すること。
//! - contract に列挙された enum 値がすべて Rust enum へ復元可能であること（schema.md ↔ Rust のドリフト検出）。

use std::collections::BTreeMap;

use serde::de::DeserializeOwned;
use serde::Deserialize;

use ygo_search::types::{
    card::{
        Attribute, CardType, LevelType, LinkMarker, MonsterType, Race, SpellEffectType,
        TrapEffectType,
    },
    options::{
        CardSearchParams, ExtractOptions, Format, JudgeAndReplaceOptions, SearchFAQParams,
        SeekCardsOptions,
    },
    Card, CardDetail, CardMatch, ExtractedPattern, FAQRecord, FAQSearchResult, FAQWithCards,
    PatternType, ReplacementResult, ReplacementStatus,
};

fn fixture(name: &str) -> String {
    let dir = env!("CARGO_MANIFEST_DIR");
    format!("{dir}/tests/fixtures/{name}")
}

fn read_json(name: &str) -> serde_json::Value {
    let raw = std::fs::read_to_string(fixture(name))
        .unwrap_or_else(|e| panic!("failed to read fixture {name}: {e}"));
    serde_json::from_str(&raw).unwrap_or_else(|e| panic!("fixture {name} is not valid JSON: {e}"))
}

/// デシリアライズ → 再シリアライズが元 JSON と構造的に等価か（camelCase・enum 値・省略の凍結）
fn assert_round_trip<T: DeserializeOwned + serde::Serialize>(name: &str) {
    let original = read_json(name);
    let raw = std::fs::read_to_string(fixture(name)).unwrap();
    let typed: T = serde_json::from_str(&raw).unwrap_or_else(|e| {
        panic!(
            "failed to deserialize fixture {name} into {}: {e}",
            std::any::type_name::<T>()
        )
    });
    let reserialized = serde_json::to_value(&typed).unwrap();
    assert_eq!(
        original,
        reserialized,
        "round-trip mismatch for {name} ({}): 型と fixture の JSON 形状が不一致",
        std::any::type_name::<T>()
    );
}

// --- Card DTO 往復（全フィールド網羅） --------------------------------------

#[test]
fn round_trip_card_monster() {
    assert_round_trip::<Card>("card-monster.json");
}

#[test]
fn round_trip_card_spell() {
    assert_round_trip::<Card>("card-spell.json");
}

#[test]
fn round_trip_card_trap() {
    assert_round_trip::<Card>("card-trap.json");
}

#[test]
fn round_trip_card_pendulum() {
    assert_round_trip::<Card>("card-pendulum.json");
}

#[test]
fn round_trip_card_link() {
    assert_round_trip::<Card>("card-link.json");
}

#[test]
fn round_trip_card_detail() {
    assert_round_trip::<CardDetail>("card-detail.json");
}

// --- FAQ 系 -----------------------------------------------------------------

#[test]
fn round_trip_faq_types() {
    let doc = read_json("faq.json");
    {
        let raw = doc["record"].to_string();
        let typed: FAQRecord = serde_json::from_str(&raw).unwrap();
        assert_eq!(doc["record"], serde_json::to_value(&typed).unwrap());
    }
    {
        let raw = doc["withCards"].to_string();
        let typed: FAQWithCards = serde_json::from_str(&raw).unwrap();
        assert_eq!(doc["withCards"], serde_json::to_value(&typed).unwrap());
    }
    {
        let raw = doc["searchResult"].to_string();
        let typed: FAQSearchResult = serde_json::from_str(&raw).unwrap();
        assert_eq!(doc["searchResult"], serde_json::to_value(&typed).unwrap());
    }
}

// --- パターン抽出系 ---------------------------------------------------------

#[test]
fn round_trip_extracted_patterns() {
    assert_round_trip::<Vec<ExtractedPattern>>("extract-patterns.json");
}

/// `type` (予約語) フィールドが正しく `type` キーで往復すること。
/// `extract-patterns.json` に flexible/exact/cardId の3値が含まれる。
#[test]
fn extract_pattern_uses_reserved_type_key() {
    let raw = std::fs::read_to_string(fixture("extract-patterns.json")).unwrap();
    let patterns: Vec<ExtractedPattern> = serde_json::from_str(&raw).unwrap();
    let ser = serde_json::to_value(&patterns).unwrap();
    assert!(ser[0]["type"].is_string(), "`type` キーが失われている");
    assert_eq!(ser[0]["type"], "flexible");
    assert_eq!(ser[1]["type"], "exact");
    assert_eq!(ser[2]["type"], "cardId");
}

/// CardMatch も予約語 `type` を持つ。往復検証。
#[test]
fn round_trip_card_match_shape() {
    let cm = CardMatch {
        pattern: "{x*}".into(),
        r#type: PatternType::Flexible,
        query: "x*".into(),
        results: vec![],
    };
    let v = serde_json::to_value(&cm).unwrap();
    let back: CardMatch = serde_json::from_value(v.clone()).unwrap();
    assert_eq!(v["type"], "flexible");
    assert_eq!(back, cm);
}

// --- Options 往復 -----------------------------------------------------------

#[test]
fn round_trip_options() {
    let card_search = CardSearchParams {
        filter: serde_json::json!({ "name": "青眼*", "attribute": "light" }),
        cols: Some(vec!["name".into(), "cardId".into()]),
        mode: Some(ygo_search::types::options::SearchMode::Partial),
        include_ruby: Some(true),
        flag_auto_modify: Some(true),
        flag_allow_wild: Some(true),
    };
    let v = serde_json::to_value(&card_search).unwrap();
    assert_eq!(v["filter"]["name"], "青眼*");
    assert_eq!(v["mode"], "partial");
    let back: CardSearchParams = serde_json::from_value(v).unwrap();
    assert_eq!(back, card_search);

    // SeekCardsOptions の range が [number, number] になること
    let seek = SeekCardsOptions {
        max: Some(20),
        random: Some(false),
        range: Some([4000, 5000]),
        all: Some(false),
        cols: None,
        col_all: Some(true),
    };
    let v = serde_json::to_value(&seek).unwrap();
    assert_eq!(v["range"], serde_json::json!([4000, 5000]));
    let back: SeekCardsOptions = serde_json::from_value(v).unwrap();
    assert_eq!(back, seek);

    // 残りの Options も最低限の往復
    round_trip_default::<SearchFAQParams>();
    round_trip_default::<ExtractOptions>();
    round_trip_default::<JudgeAndReplaceOptions>();
}

fn round_trip_default<
    T: Default + serde::Serialize + DeserializeOwned + PartialEq + std::fmt::Debug,
>() {
    let val = T::default();
    let v = serde_json::to_value(&val).unwrap();
    let back: T = serde_json::from_value(v).unwrap();
    assert_eq!(back, val);
}

// --- enum 文字列値の検証（TS リテラルとの一致・特殊ケース） -----------------

#[test]
fn race_multiword_serializes_concat_lower() {
    // schema.md は連結小文字: beastwarrior / seaserpent / windbeast / creatorgod
    for (variant, expect) in [
        (Race::BeastWarrior, "beastwarrior"),
        (Race::SeaSerpent, "seaserpent"),
        (Race::WindBeast, "windbeast"),
        (Race::CreatorGod, "creatorgod"),
        (Race::Spellcaster, "spellcaster"),
    ] {
        let ser = serde_json::to_value(&variant).unwrap();
        assert_eq!(ser, expect);
        // 復元も可能
        let back: Race = serde_json::from_value(ser).unwrap();
        assert_eq!(back, variant);
    }
}

#[test]
fn spell_effect_type_uses_quick_not_quickplay() {
    // schema.md / card.ts は "quick"。converter.ts の "quickPlay" は M0-T3 で解決。
    let ser = serde_json::to_value(&SpellEffectType::QuickPlay).unwrap();
    assert_eq!(ser, "quick");
    let back: SpellEffectType = serde_json::from_str("\"quick\"").unwrap();
    assert_eq!(back, SpellEffectType::QuickPlay);
}

#[test]
fn pattern_type_cardid_is_camel_case() {
    assert_eq!(
        serde_json::to_value(&PatternType::CardId).unwrap(),
        "cardId"
    );
}

#[test]
fn replacement_status_already_processed_uses_underscore() {
    let ser = serde_json::to_value(&ReplacementStatus::AlreadyProcessed).unwrap();
    assert_eq!(ser, "already_processed");
}

#[test]
fn link_marker_uses_kebab_case() {
    for (variant, expect) in [
        (LinkMarker::TopLeft, "top-left"),
        (LinkMarker::BottomRight, "bottom-right"),
        (LinkMarker::Top, "top"),
    ] {
        assert_eq!(serde_json::to_value(&variant).unwrap(), expect);
    }
}

/// `ReplacementResult` の camelCase + ネスト配列形状。
#[test]
fn replacement_result_shape() {
    let rr = ReplacementResult {
        processed_text: "Use {{青眼の白龍|4007}}".into(),
        has_unprocessed: false,
        warnings: vec![],
        processed_patterns: vec![ygo_search::types::card::ProcessedPattern {
            original: "{青眼の白龍}".into(),
            replaced: "{{青眼の白龍|4007}}".into(),
            status: ReplacementStatus::Resolved,
        }],
    };
    let v = serde_json::to_value(&rr).unwrap();
    assert_eq!(v["processedText"], "Use {{青眼の白龍|4007}}");
    assert_eq!(v["hasUnprocessed"], false);
    assert_eq!(v["processedPatterns"][0]["status"], "resolved");
    let back: ReplacementResult = serde_json::from_value(v).unwrap();
    assert_eq!(back, rr);
}

#[test]
fn format_enum_values() {
    assert_eq!(serde_json::to_value(&Format::Json).unwrap(), "json");
    assert_eq!(serde_json::to_value(&Format::Jsonl).unwrap(), "jsonl");
    assert_eq!(serde_json::to_value(&Format::Jsonc).unwrap(), "jsonc");
    assert_eq!(serde_json::to_value(&Format::Yaml).unwrap(), "yaml");
}

// --- TSV カラム契約 ---------------------------------------------------------

#[derive(Deserialize)]
struct ContractColumn {
    name: String,
    #[serde(default)]
    #[allow(dead_code)]
    required: bool,
    #[serde(default)]
    #[allow(dead_code)]
    values: Vec<String>,
}

#[derive(Deserialize)]
struct ContractFile {
    #[allow(dead_code)]
    description: String,
    columns: Vec<ContractColumn>,
}

#[derive(Deserialize)]
struct ContractDoc {
    files: BTreeMap<String, ContractFile>,
}

fn load_contract() -> ContractDoc {
    let raw = std::fs::read_to_string(fixture("tsv-contract.json")).unwrap();
    serde_json::from_str(&raw).unwrap()
}

fn column_names(file: &str) -> Vec<String> {
    let doc = load_contract();
    doc.files
        .get(file)
        .unwrap_or_else(|| panic!("contract missing file {file}"))
        .columns
        .iter()
        .map(|c| c.name.clone())
        .collect()
}

#[test]
fn cards_all_columns_match_schema() {
    assert_eq!(
        column_names("cards-all.tsv"),
        vec![
            "cardType",
            "name",
            "nameModified",
            "ruby",
            "cardId",
            "ciid",
            "imgs",
            "text",
            "attribute",
            "levelType",
            "levelValue",
            "race",
            "monsterTypes",
            "atk",
            "def",
            "linkMarkers",
            "pendulumScale",
            "pendulumText",
            "isExtraDeck",
            "spellEffectType",
            "trapEffectType",
        ]
    );
}

#[test]
fn detail_all_columns_match_schema() {
    assert_eq!(
        column_names("detail-all.tsv"),
        vec![
            "cardId",
            "cardName",
            "supplementInfo",
            "supplementDate",
            "pendulumSupplementInfo",
            "pendulumSupplementDate",
        ]
    );
}

#[test]
fn faq_all_columns_match_schema() {
    assert_eq!(
        column_names("faq-all.tsv"),
        vec!["faqId", "question", "answer", "updatedAt"]
    );
}

/// contract に列挙された各 enum 値がすべて Rust enum へ復元可能であること。
/// schema.md の値集合と Rust の enum variant がドリフトしていないか検出する。
#[test]
fn contract_enum_values_all_parse() {
    let doc = load_contract();
    let cards = &doc.files["cards-all.tsv"].columns;

    fn values_of<'a>(cols: &'a [ContractColumn], name: &str) -> &'a [String] {
        &cols.iter().find(|c| c.name == name).unwrap().values
    }

    assert_all_parse::<CardType>(values_of(cards, "cardType"));
    assert_all_parse::<Attribute>(values_of(cards, "attribute"));
    assert_all_parse::<LevelType>(values_of(cards, "levelType"));
    assert_all_parse::<Race>(values_of(cards, "race"));
    assert_all_parse::<MonsterType>(values_of(cards, "monsterTypes"));
    assert_all_parse::<LinkMarker>(values_of(cards, "linkMarkers"));
    assert_all_parse::<SpellEffectType>(values_of(cards, "spellEffectType"));
    assert_all_parse::<TrapEffectType>(values_of(cards, "trapEffectType"));
}

fn assert_all_parse<T: DeserializeOwned>(values: &[String]) {
    for v in values {
        let json = serde_json::Value::String(v.clone());
        let result: Result<T, _> = serde_json::from_value(json);
        assert!(
            result.is_ok(),
            "contract enum 値 {:?} が {} へ復元できない（schema.md ↔ Rust のドリフト）",
            v,
            std::any::type_name::<T>()
        );
    }
}
