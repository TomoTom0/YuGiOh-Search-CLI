//! fs feature: seek_cards_projected の統合テスト。
//!
//! fixture cards-all.tsv + detail-all.tsv を一時 workdir に置き、TS `seekCards` と同一の
//! 列投影（cols / colAll）と detail-all.tsv マージ（cardId 結合・既存キー不更新・
//! backslash-n アンエスケープ）を検証する。決定性のため `random=false` を使う。
#![cfg(feature = "fs")]

use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::Value;
use ygo_search::fs::{self, clear_cache, FsError};
use ygo_search::types::options::SeekCardsOptions;

// グローバルキャッシュと env を触るため、本バイナリ内のテストを直列化。
static SERIAL: Mutex<()> = Mutex::new(());

/// fixture cards-all.tsv のヘッダ（21 列・colAll の cards 側期望順）。
const CARDS_HEADERS: [&str; 21] = [
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
];

/// colAll 時の detail 側追加分（detail-all.tsv ヘッダのうち cards に無いもの・期待順）。
const DETAIL_EXTRA_HEADERS: [&str; 5] = [
    "cardName",
    "supplementInfo",
    "supplementDate",
    "pendulumSupplementInfo",
    "pendulumSupplementDate",
];

fn fixture(name: &str) -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests/fixtures");
    p.push(name);
    p
}

struct Workdir {
    _dir: tempfile::TempDir,
}

impl Workdir {
    /// cards-all.tsv + detail-all.tsv の両 fixture を置く。`SERIAL` ガード保持下で呼ぶこと。
    fn with_detail() -> Self {
        Self::new(true)
    }

    /// cards-all.tsv のみ（detail-all.tsv 無し = TS `existsSync` 分岐の false 側）。
    fn cards_only() -> Self {
        Self::new(false)
    }

    fn new(with_detail: bool) -> Self {
        let dir = tempfile::tempdir().expect("tempdir");
        let tsv_dir = dir.path().join("data").join("tsv");
        std::fs::create_dir_all(&tsv_dir).unwrap();
        std::fs::copy(fixture("cards-all.tsv"), tsv_dir.join("cards-all.tsv")).unwrap();
        if with_detail {
            std::fs::copy(fixture("detail-all.tsv"), tsv_dir.join("detail-all.tsv")).unwrap();
        }
        // safety: テスト専用 env。edition 2021 では set_var は safe。
        std::env::set_var("YGO_SEARCH_WORKDIR", dir.path());
        Self { _dir: dir }
    }
}

impl Drop for Workdir {
    fn drop(&mut self) {
        clear_cache();
        std::env::remove_var("YGO_SEARCH_WORKDIR");
    }
}

fn lock_and_reset() -> std::sync::MutexGuard<'static, ()> {
    let guard = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    clear_cache();
    guard
}

fn obj(v: &Value) -> &serde_json::Map<String, Value> {
    v.as_object().expect("Object であること")
}

fn keys(v: &Value) -> Vec<&str> {
    obj(v).keys().map(|k| k.as_str()).collect()
}

fn str_of<'a>(v: &'a Value, k: &str) -> &'a str {
    obj(v)
        .get(k)
        .expect("キーが存在すること")
        .as_str()
        .expect("文字列値であること")
}

#[test]
fn projected_default_cols() {
    let _guard = lock_and_reset();
    let _wd = Workdir::with_detail();
    // cols 無指定 → [cardId, name] のみ・この順（fixture 先頭行 = cardId 10000）
    let r = fs::seek_cards_projected(&SeekCardsOptions {
        max: Some(1),
        random: Some(false),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 1);
    assert_eq!(keys(&r[0]), vec!["cardId", "name"]);
    assert_eq!(str_of(&r[0], "cardId"), "10000");
    assert_eq!(str_of(&r[0], "name"), "青眼の白龍");
}

#[test]
fn projected_cols_unescapes_detail_supplement_info() {
    let _guard = lock_and_reset();
    let _wd = Workdir::with_detail();
    // cardId 10000: detail の supplementInfo がリテラル backslash-n から改行へアンエスケープ済み
    let r = fs::seek_cards_projected(&SeekCardsOptions {
        range: Some([10000, 10000]),
        all: Some(true),
        cols: Some(vec![
            "cardId".into(),
            "name".into(),
            "supplementInfo".into(),
        ]),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 1);
    assert_eq!(
        str_of(&r[0], "supplementInfo"),
        "補足一行\n補足二行",
        "リテラル \\n が改行へアンエスケープされていること"
    );
}

#[test]
fn projected_cols_empty_for_card_without_detail_row() {
    let _guard = lock_and_reset();
    let _wd = Workdir::with_detail();
    // detail 行の無いカード（30000）→ 欠けた列は空文字
    let r = fs::seek_cards_projected(&SeekCardsOptions {
        range: Some([30000, 30000]),
        all: Some(true),
        cols: Some(vec!["cardId".into(), "supplementInfo".into()]),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 1);
    assert_eq!(str_of(&r[0], "cardId"), "30000");
    assert_eq!(str_of(&r[0], "supplementInfo"), "");
}

#[test]
fn projected_detail_merge_keeps_card_side_and_merges_missing() {
    let _guard = lock_and_reset();
    let _wd = Workdir::with_detail();
    // cardId 20000: supplementInfo は空だが pendulumSupplementDate は detail 側からマージされる
    let r = fs::seek_cards_projected(&SeekCardsOptions {
        range: Some([20000, 20000]),
        all: Some(true),
        cols: Some(vec![
            "cardId".into(),
            "supplementInfo".into(),
            "pendulumSupplementDate".into(),
        ]),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 1);
    assert_eq!(str_of(&r[0], "supplementInfo"), "");
    assert_eq!(str_of(&r[0], "pendulumSupplementDate"), "2023-12-01");
}

#[test]
fn projected_col_all_key_order() {
    let _guard = lock_and_reset();
    let _wd = Workdir::with_detail();
    // colAll: cards ヘッダ全列 + detail ヘッダのうち cards に無いもの（detail ヘッダ順）
    let mut expected: Vec<&str> = CARDS_HEADERS.to_vec();
    expected.extend(DETAIL_EXTRA_HEADERS);
    let r = fs::seek_cards_projected(&SeekCardsOptions {
        range: Some([10000, 20000]),
        all: Some(true),
        col_all: Some(true),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 2);
    for rec in &r {
        assert_eq!(
            keys(rec),
            expected,
            "colAll のキー順が cards+detail 和集合と一致"
        );
    }
    // マージ値の確認（10000 行: cardName は detail 側、supplementInfo はアンエスケープ済み）
    assert_eq!(str_of(&r[0], "cardId"), "10000");
    assert_eq!(str_of(&r[0], "cardName"), "青眼の白龍");
    assert_eq!(str_of(&r[0], "supplementInfo"), "補足一行\n補足二行");
    assert_eq!(str_of(&r[0], "supplementDate"), "2024-01-01");
}

#[test]
fn projected_range_all_with_cols() {
    let _guard = lock_and_reset();
    let _wd = Workdir::with_detail();
    // range + all + cols の併用（TSV 行順・マージは cardId 結合）
    let r = fs::seek_cards_projected(&SeekCardsOptions {
        range: Some([10000, 20000]),
        all: Some(true),
        cols: Some(vec!["cardId".into(), "pendulumSupplementDate".into()]),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 2);
    assert_eq!(keys(&r[0]), vec!["cardId", "pendulumSupplementDate"]);
    assert_eq!(str_of(&r[0], "cardId"), "10000");
    assert_eq!(str_of(&r[0], "pendulumSupplementDate"), "");
    assert_eq!(str_of(&r[1], "cardId"), "20000");
    assert_eq!(str_of(&r[1], "pendulumSupplementDate"), "2023-12-01");
}

#[test]
fn projected_without_detail_file() {
    let _guard = lock_and_reset();
    let _wd = Workdir::cards_only();
    // detail 無しでも cols に supplementInfo を含められる（欠けた列は空文字）
    let r = fs::seek_cards_projected(&SeekCardsOptions {
        range: Some([10000, 10000]),
        all: Some(true),
        cols: Some(vec!["cardId".into(), "supplementInfo".into()]),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 1);
    assert_eq!(keys(&r[0]), vec!["cardId", "supplementInfo"]);
    assert_eq!(str_of(&r[0], "supplementInfo"), "");
    // colAll は cards ヘッダのみ
    let r = fs::seek_cards_projected(&SeekCardsOptions {
        range: Some([10000, 20000]),
        all: Some(true),
        col_all: Some(true),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 2);
    assert_eq!(keys(&r[0]), CARDS_HEADERS.to_vec());
}

#[test]
fn projected_all_without_range_errors() {
    let _guard = lock_and_reset();
    let _wd = Workdir::with_detail();
    let res = fs::seek_cards_projected(&SeekCardsOptions {
        all: Some(true),
        ..Default::default()
    });
    match res {
        Err(FsError::InvalidOption(msg)) => assert_eq!(msg, "--all requires --range"),
        other => panic!("InvalidOption を期待: {other:?}"),
    }
}
