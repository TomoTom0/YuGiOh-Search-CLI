//! fs feature 統合テスト。fixture TSV のパース・パス解決・enum 変換を検証。
#![cfg(feature = "fs")]

use std::path::PathBuf;

use ygo_search::fs::{self, resolve_workdir};
use ygo_search::types::card::{Attribute, CardType, Race, SpellEffectType};

fn fixture(name: &str) -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests/fixtures");
    p.push(name);
    p
}

// --- パス解決（resolve_workdir: env 触らず純粋検証） ---

#[test]
fn resolve_workdir_env_absolute() {
    let home = std::path::Path::new("/home/user");
    assert_eq!(
        resolve_workdir(Some("/data/ygo"), home),
        PathBuf::from("/data/ygo")
    );
}

#[test]
fn resolve_workdir_env_tilde() {
    let home = std::path::Path::new("/home/user");
    assert_eq!(
        resolve_workdir(Some("~/foo"), home),
        PathBuf::from("/home/user/foo")
    );
}

#[test]
fn resolve_workdir_default() {
    let home = std::path::Path::new("/home/user");
    assert_eq!(
        resolve_workdir(None, home),
        PathBuf::from("/home/user/.local/ygo-search")
    );
}

// --- cards-all.tsv パース（21列・位置ベース） ---

#[test]
fn read_cards_monster_fields() {
    let cards = fs::tsv::read_cards(&fixture("cards-all.tsv")).unwrap();
    let c = cards.iter().find(|c| c.card_id == "10000").unwrap();
    assert_eq!(c.card_type, CardType::Monster);
    assert_eq!(c.name, "青眼の白龍");
    assert_eq!(c.name_modified, "aomenohakuryu");
    assert_eq!(c.race, Some(Race::Dragon));
    assert_eq!(c.attribute, Some(Attribute::Dark));
    assert_eq!(c.atk.as_deref(), Some("3000"));
    assert_eq!(c.def.as_deref(), Some("2500"));
    // text の `\n` アンエスケープ
    assert_eq!(c.text.as_deref(), Some("攻撃力は3000\ndefは2500。"));
    // imgs JSON 文字列を生保持
    assert_eq!(c.imgs.as_deref(), Some("[\"img1.png\"]"));
    assert_eq!(c.monster_types.as_deref(), Some("[\"normal\"]"));
    // ciid 空 → None
    assert!(c.ciid.is_none());
}

#[test]
fn read_cards_spell_quick_and_quote_literal() {
    let cards = fs::tsv::read_cards(&fixture("cards-all.tsv")).unwrap();
    let c = cards.iter().find(|c| c.card_id == "20000").unwrap();
    assert_eq!(c.card_type, CardType::Spell);
    // spellEffectType "quick" → QuickPlay（schema.md 契約）
    assert_eq!(c.spell_effect_type, Some(SpellEffectType::QuickPlay));
    // quoting(false) で `"` がリテラル保存される
    assert_eq!(c.text.as_deref(), Some("デッキから\"2枚\"ドローする。"));
}

#[test]
fn read_cards_pendulum_fields() {
    let cards = fs::tsv::read_cards(&fixture("cards-all.tsv")).unwrap();
    let c = cards.iter().find(|c| c.card_id == "30000").unwrap();
    assert_eq!(c.pendulum_scale.as_deref(), Some("1-8"));
    // pendulumText の `\n` アンエスケープ
    assert_eq!(c.pendulum_text.as_deref(), Some("ペンデュラム\n効果"));
    assert_eq!(
        c.monster_types.as_deref(),
        Some("[\"normal\",\"pendulum\"]")
    );
}

// --- detail-all.tsv パース（6列） ---

#[test]
fn read_card_details_fields() {
    let details = fs::tsv::read_card_details(&fixture("detail-all.tsv")).unwrap();
    let d = details.iter().find(|d| d.card_id == "10000").unwrap();
    assert_eq!(d.card_name, "青眼の白龍");
    assert_eq!(d.supplement_info.as_deref(), Some("補足一行\n補足二行"));
    assert_eq!(d.supplement_date.as_deref(), Some("2024-01-01"));

    let d2 = details.iter().find(|d| d.card_id == "20000").unwrap();
    // 空フィールド → None
    assert!(d2.supplement_info.is_none());
    assert_eq!(
        d2.pendulum_supplement_date.as_deref(),
        Some("2023-12-01")
    );
}

// --- faq-all.tsv パース（4列・無効 faqId スキップ） ---

#[test]
fn read_faqs_skip_invalid_id() {
    let faqs = fs::tsv::read_faqs(&fixture("faq-all.tsv")).unwrap();
    // "abc" 行はスキップ → 2件
    assert_eq!(faqs.len(), 2);
    let q1 = faqs.iter().find(|f| f.faq_id == 1).unwrap();
    assert_eq!(q1.question, "このカードは\n特殊召喚できますか?");
    assert_eq!(q1.answer, "はい、可能です。");
    assert_eq!(q1.updated_at, "2024-05-01");
    let q2 = faqs.iter().find(|f| f.faq_id == 2).unwrap();
    // `{{name|id}}` 参照はそのまま保持（抽出は M2-T2）
    assert_eq!(q2.question, "{{青眼の白龍|10000}}の効果は?");
}

// --- ファイル不在 ---

#[test]
fn read_cards_missing_path_is_error() {
    let result = fs::tsv::read_cards(&fixture("nonexistent.tsv"));
    assert!(result.is_err());
}
