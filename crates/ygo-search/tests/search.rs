//! fs feature: search.rs ラッパの統合テスト。
//!
//! `search_cards` / `search_faq` / `load_faq_index` / `get_cards_by_ids` /
//! `extract_card_references` を、fixture TSV を置いた一時 workdir +
//! モジュールキャッシュ経由で end-to-end 検証する。
#![cfg(feature = "fs")]

use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::json;
use ygo_search::fs::{self, clear_cache};
use ygo_search::types::options::{CardSearchParams, SearchFAQParams};

// グローバルキャッシュと env を触るため、本バイナリ内のテストを直列化。
static SERIAL: Mutex<()> = Mutex::new(());

fn fixture(name: &str) -> PathBuf {
    let mut p = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.push("tests/fixtures");
    p.push(name);
    p
}

/// テスト用 workdir（一時ディレクトリに fixture TSV を配置）。
/// 呼び出し側が `SERIAL` ガードをテスト本体全体で保持すること（env・キャッシュは
/// プロセス全局なので、並列テスト間での干渉を防ぐ）。
struct Workdir {
    _dir: tempfile::TempDir,
}

impl Workdir {
    /// `SERIAL` ガード保持下で呼ぶこと。
    fn new() -> Self {
        let dir = tempfile::tempdir().expect("tempdir");
        let tsv_dir = dir.path().join("data").join("tsv");
        std::fs::create_dir_all(&tsv_dir).unwrap();
        for name in &["cards-all.tsv", "faq-all.tsv"] {
            std::fs::copy(fixture(name), tsv_dir.join(name)).unwrap();
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

fn ids(cards: &[ygo_search::types::Card]) -> Vec<&str> {
    cards.iter().map(|c| c.card_id.as_str()).collect()
}

// 各テストはグローバルキャッシュ + env を触るため、`SERIAL` ガードを本体全体で保持する。
// `let _wd = Workdir::new()` は env を設定し、drop で掃除する（_guard より後に drop）。
fn lock_and_reset() -> std::sync::MutexGuard<'static, ()> {
    let guard = SERIAL.lock().unwrap_or_else(|e| e.into_inner());
    clear_cache();
    guard
}

// --- search_cards -----------------------------------------------------------

#[test]
fn search_cards_by_name_via_ruby_fallback() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    // fixture の nameModified はローマ字("aomenohakuryu")なので name 列直接は合致せず、
    // ruby="青眼の白龍" のフォールバックで合致する。
    let r = fs::search_cards(&CardSearchParams {
        filter: json!({ "name": "青眼の白龍" }),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(ids(&r), vec!["10000"]);
}

#[test]
fn search_cards_by_attribute_exact() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::search_cards(&CardSearchParams {
        filter: json!({ "attribute": "dark" }),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(ids(&r), vec!["10000", "30000"]);
}

#[test]
fn search_cards_by_cardid_array_or() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::search_cards(&CardSearchParams {
        filter: json!({ "cardId": ["10000", "30000"] }),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(ids(&r), vec!["10000", "30000"]);
}

#[test]
fn search_cards_wildcard_name() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    // ruby 列に対する wildcard フォールバック。ruby="強欲な壺" → ^強欲.* は合致せず、
    // 10000 ruby="青眼の白龍"、30000 ruby="オッドアイズ"。nameModified も試すがローマ字。
    // 結果的に "青眼*" は 10000 のみ（ruby が 青眼 始まり）。
    let r = fs::search_cards(&CardSearchParams {
        filter: json!({ "name": "青眼*" }),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(ids(&r), vec!["10000"]);
}

// --- get_cards_by_ids -------------------------------------------------------

#[test]
fn get_cards_by_ids_skips_missing_preserves_order() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::get_cards_by_ids(&["30000", "99999", "10000"]).unwrap();
    assert_eq!(ids(&r), vec!["30000", "10000"]);
}

#[test]
fn get_cards_by_ids_dedup() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::get_cards_by_ids(&["10000", "10000"]).unwrap();
    assert_eq!(ids(&r), vec!["10000"]);
}

// --- load_faq_index ---------------------------------------------------------

#[test]
fn load_faq_index_structure() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let idx = fs::load_faq_index().unwrap();
    // "abc" 行はスキップ → 2件
    assert_eq!(idx.by_id.len(), 2);
    // FAQ 2 は cardId 10000 を参照
    assert_eq!(idx.by_card_id.get(&10000), Some(&vec![2]));
    // normalized が空でない
    let n2 = idx.normalized.get(&2).unwrap();
    assert!(!n2.question.is_empty());
}

// --- search_faq -------------------------------------------------------------

#[test]
fn search_faq_by_faq_id_enriches_cards() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::search_faq(&SearchFAQParams {
        faq_id: Some(2),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 1);
    let faq = &r[0].faq;
    // question "{{青眼の白龍|10000}}の効果は?" → cardId 10000 を 1件参照
    assert_eq!(faq.question_cards.len(), 1);
    assert_eq!(faq.question_cards[0].card_id, "10000");
    assert!(faq.answer_cards.is_empty());
    assert_eq!(faq.all_card_ids, vec![10000]);
    assert!(r[0].score.is_none()); // スコアリング無し
}

#[test]
fn search_faq_by_card_id() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::search_faq(&SearchFAQParams {
        card_id: Some(10000),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 1);
    assert_eq!(r[0].faq.record.faq_id, 2);
}

#[test]
fn search_faq_by_question_text() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    // normalized question（FAQ 2）は 効果 を含む。FAQ 1 は含まない。
    let r = fs::search_faq(&SearchFAQParams {
        question: Some("効果".into()),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 1);
    assert_eq!(r[0].faq.record.faq_id, 2);
}

#[test]
fn search_faq_faq_id_not_found_returns_empty() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::search_faq(&SearchFAQParams {
        faq_id: Some(999),
        ..Default::default()
    })
    .unwrap();
    assert!(r.is_empty());
}

// --- extract_card_references（純粋・IO なし） -------------------------------

#[test]
fn extract_card_references_basic() {
    let refs = fs::extract_card_references("{{青眼の白龍|10000}}と{{ブラック|5678}}");
    assert_eq!(refs.len(), 2);
    assert_eq!(refs[0].card_id, 10000);
    assert_eq!(refs[0].card_name, "青眼の白龍");
    assert_eq!(refs[0].position, 0);
    assert_eq!(refs[1].card_id, 5678);
    assert_eq!(refs[1].card_name, "ブラック");
}

#[test]
fn extract_card_references_empty_when_no_match() {
    assert!(fs::extract_card_references("カード参照なし").is_empty());
}
