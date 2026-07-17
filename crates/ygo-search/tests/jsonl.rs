//! fs feature: jsonl 変換（convert_cards/faqs/generic_to_jsonl）の統合テスト。
//!
//! fixture TSV を引数パス直接で読み込み（workdir/env 非依存）、JSONL 出力を検証する。
#![cfg(feature = "fs")]

use std::path::PathBuf;

use serde_json::{json, Value};
use ygo_search::fs;
use ygo_search::types::options::GenericConversionOptions;
use ygo_search::types::VectorRecord;

fn fixture(name: &str) -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests/fixtures");
    p.push(name);
    p
}

/// JSONL を読んで `VectorRecord` 列にパース。
fn read_jsonl(path: &PathBuf) -> Vec<VectorRecord> {
    let body = std::fs::read_to_string(path).unwrap();
    body.trim()
        .split('\n')
        .map(serde_json::from_str)
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
}

// --- convert_cards_to_jsonl -------------------------------------------------

#[test]
fn convert_cards_count_and_blue_eyes() {
    let tmp = tempfile::tempdir().unwrap();
    let out = tmp.path().join("cards.jsonl");
    let n = fs::convert_cards_to_jsonl(
        &fixture("cards-all.tsv"),
        &fixture("detail-all.tsv"),
        &out,
    )
    .unwrap();
    assert_eq!(n, 3);

    let recs = read_jsonl(&out);
    assert_eq!(recs.len(), 3);

    let blue = recs.iter().find(|r| r.id == "card-10000").unwrap();
    assert!(blue.text.contains("【カード名】 青眼の白龍"));
    assert!(blue.text.contains("【分類】 通常モンスター"));
    assert!(blue.text.contains("【ステータス】 dark / dragon / 星8 / 攻3000 / 守2500"));
    assert!(blue.text.contains("【テキスト】\n攻撃力は3000\n"));
    // detail 補足マージ（\n はアンエスケープ済み）
    assert!(blue.text.contains("【補足】\n補足一行\n補足二行"));

    let md = blue.metadata.as_object().unwrap();
    assert_eq!(md.get("cardId").unwrap(), &json!(10000));
    assert_eq!(md.get("cardType").unwrap(), &json!("monster"));
    assert_eq!(md.get("atk").unwrap(), &json!(3000));
    assert_eq!(md.get("def").unwrap(), &json!(2500));
    assert_eq!(md.get("attribute").unwrap(), &json!("dark"));
    assert_eq!(md.get("race").unwrap(), &json!("dragon"));
    assert_eq!(md.get("levelType").unwrap(), &json!("level"));
    assert_eq!(md.get("levelValue").unwrap(), &json!(8));
}

#[test]
fn convert_cards_spell_and_pendulum() {
    let tmp = tempfile::tempdir().unwrap();
    let out = tmp.path().join("cards.jsonl");
    fs::convert_cards_to_jsonl(&fixture("cards-all.tsv"), &fixture("detail-all.tsv"), &out).unwrap();
    let recs = read_jsonl(&out);

    // spell（quick → 速攻魔法・補足無し）
    let pot = recs.iter().find(|r| r.id == "card-20000").unwrap();
    assert!(pot.text.contains("【分類】 速攻魔法"));
    assert!(!pot.text.contains("【補足】"));
    let md = pot.metadata.as_object().unwrap();
    assert_eq!(md.get("cardType").unwrap(), &json!("spell"));
    assert_eq!(md.get("spellEffectType").unwrap(), &json!("quick"));
    // spell は atk/def 等を持たない
    assert!(md.get("atk").is_none());

    // pendulum（["normal","pendulum"] → 通常・ペンデュラムモンスター・Pスケール効果）
    let odd = recs.iter().find(|r| r.id == "card-30000").unwrap();
    assert!(odd.text.contains("【分類】 通常・ペンデュラムモンスター"));
    assert!(odd.text.contains("【Pスケール効果】\nペンデュラム"));
}

// --- convert_faqs_to_jsonl --------------------------------------------------

#[test]
fn convert_faqs_count_and_text() {
    let tmp = tempfile::tempdir().unwrap();
    let out = tmp.path().join("faqs.jsonl");
    let n = fs::convert_faqs_to_jsonl(&fixture("faq-all.tsv"), &out).unwrap();
    // abc 行も件数に含む（faqId 数値化不可は null・TS 全行処理と同じ）
    assert_eq!(n, 3);

    let recs = read_jsonl(&out);
    let r1 = recs.iter().find(|r| r.id == "faq-1").unwrap();
    assert!(r1.text.contains("# 質問\nこのカードは\n特殊召喚できますか?"));
    assert!(r1.text.contains("# 回答\nはい、可能です。"));
    assert_eq!(r1.metadata.get("faqId").unwrap(), &json!(1));
    assert_eq!(r1.metadata.get("updatedAt").unwrap(), &json!("2024-05-01"));

    // 無効 faqId 行: id="faq-abc", faqId=null
    let rabc = recs.iter().find(|r| r.id == "faq-abc").unwrap();
    assert_eq!(rabc.metadata.get("faqId").unwrap(), &Value::Null);
}

// --- convert_generic_to_jsonl（fs + format）---------------------------------

#[cfg(feature = "format")]
mod generic {
    use super::*;

    fn write_input(name: &str, content: &str) -> (tempfile::TempDir, PathBuf) {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join(name);
        std::fs::write(&p, content).unwrap();
        (tmp, p)
    }

    #[test]
    fn json_recursive_extract_with_path() {
        let json = r#"{"items":[{"id":"a","title":"A","text":"aa","extra":"x"}],"nested":{"id":"b","title":"B","text":"bb"}}"#;
        let (_dir, input) = write_input("in.json", json);
        let out = input.with_file_name("out.jsonl");
        let n = fs::convert_generic_to_jsonl(&input, &out, &GenericConversionOptions::default())
            .unwrap();
        assert_eq!(n, 2);

        let recs = read_jsonl(&out);
        let a = recs.iter().find(|r| r.id == "a").unwrap();
        assert!(a.text.contains("【階層】\nitems"));
        assert!(a.text.contains("【テキスト】\naa"));
        assert!(a.text.contains("【extra】\nx"));
        assert_eq!(a.metadata.get("extra").unwrap(), &json!("x"));
        assert!(a.metadata.get("title").is_none()); // title/text/path は metadata から除去

        let b = recs.iter().find(|r| r.id == "b").unwrap();
        assert!(b.text.contains("【階層】\nnested"));
    }

    #[test]
    fn tsv_requires_id_title_text() {
        // id/title/text 無しはエラー
        let (_dir, input) = write_input("in.tsv", "a\tb\n1\t2\n");
        let out = input.with_file_name("out.jsonl");
        let res = fs::convert_generic_to_jsonl(&input, &out, &GenericConversionOptions::default());
        assert!(res.is_err());

        // 正常系
        let (_dir2, input2) = write_input(
            "ok.tsv",
            "id\ttitle\ttext\na\tA\taa\nb\tB\tbb\n",
        );
        let out2 = input2.with_file_name("ok.jsonl");
        let n = fs::convert_generic_to_jsonl(&input2, &out2, &GenericConversionOptions::default())
            .unwrap();
        assert_eq!(n, 2);
    }

    #[test]
    fn exclude_columns_drops_field_from_text() {
        let json = r#"{"id":"a","title":"A","text":"aa","secret":"s","keep":"k"}"#;
        let (_dir, input) = write_input("in.json", json);
        let out = input.with_file_name("out.jsonl");
        let opts = GenericConversionOptions {
            exclude_columns: Some(vec!["secret".into()]),
            ..Default::default()
        };
        fs::convert_generic_to_jsonl(&input, &out, &opts).unwrap();
        let recs = read_jsonl(&out);
        let a = &recs[0];
        assert!(!a.text.contains("【secret】"));
        assert!(a.text.contains("【keep】"));
        // metadata からは除去されない（除外は text 構築のみ。TS も metadata は全保持）
        assert!(a.metadata.get("secret").is_some());
    }

    #[test]
    fn both_exclude_and_include_is_error() {
        let json = r#"{"id":"a","title":"A","text":"aa"}"#;
        let (_dir, input) = write_input("in.json", json);
        let out = input.with_file_name("out.jsonl");
        let opts = GenericConversionOptions {
            exclude_columns: Some(vec!["x".into()]),
            include_columns: Some(vec!["y".into()]),
            ..Default::default()
        };
        let res = fs::convert_generic_to_jsonl(&input, &out, &opts);
        assert!(res.is_err());
    }
}
