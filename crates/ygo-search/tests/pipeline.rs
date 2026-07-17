//! fs feature: pipeline（extract_and_search_cards / judge_and_replace）の統合テスト。
//!
//! `extract_card_patterns`（純粋）と、fixture cards-all.tsv 経由の検索連携を検証する。
//! 複数候補（multiple）ケースは専用のカスタム TSV workdir を使用する。
#![cfg(feature = "fs")]

use std::path::PathBuf;
use std::sync::Mutex;

use ygo_search::fs::{self, clear_cache};
use ygo_search::types::options::{ExtractOptions, JudgeAndReplaceOptions};
use ygo_search::types::ReplacementStatus;

static SERIAL: Mutex<()> = Mutex::new(());

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
    /// `SERIAL` ガード保持下で呼ぶこと。fixture cards-all.tsv を配置。
    fn new() -> Self {
        let dir = tempfile::tempdir().expect("tempdir");
        let tsv_dir = dir.path().join("data").join("tsv");
        std::fs::create_dir_all(&tsv_dir).unwrap();
        std::fs::copy(fixture("cards-all.tsv"), tsv_dir.join("cards-all.tsv")).unwrap();
        // safety: テスト専用 env。edition 2021 では set_var は safe。
        std::env::set_var("YGO_SEARCH_WORKDIR", dir.path());
        Self { _dir: dir }
    }

    /// 複数候補テスト用: "青眼" で始まる 2 枚を含む cards-all.tsv を配置。
    fn new_multi() -> Self {
        let dir = tempfile::tempdir().expect("tempdir");
        let tsv_dir = dir.path().join("data").join("tsv");
        std::fs::create_dir_all(&tsv_dir).unwrap();
        // cardType name nameModified ruby cardId
        let tsv = "cardType\tname\tnameModified\truby\tcardId\n\
                   monster\t青眼の白龍\taomenohakuryu\t青眼の白龍\t10000\n\
                   monster\t青眼の亜白龍\taomenoaohakuryu\t青眼の亜白龍\t10001\n";
        std::fs::write(tsv_dir.join("cards-all.tsv"), tsv).unwrap();
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

// --- extract_card_patterns（純粋・workdir 不要）----------------------------

#[test]
fn extract_patterns_priority_and_fields() {
    // workdir 不要だが、env 干渉を避けるためガードだけ保持。
    let _guard = lock_and_reset();
    let pats = fs::extract_card_patterns(
        "Use {ブルーアイズ*} and 《青眼の白龍》 and {{青眼の白龍|10000}}",
        &ExtractOptions::default(),
    );
    assert_eq!(pats.len(), 3);
    // 優先順位: cardId > exact > flexible
    assert_eq!(pats[0].r#type, ygo_search::types::PatternType::CardId);
    assert_eq!(pats[0].query, "10000");
    assert_eq!(pats[0].original_name.as_deref(), Some("青眼の白龍"));
    assert_eq!(pats[1].r#type, ygo_search::types::PatternType::Exact);
    assert_eq!(pats[1].query, "青眼の白龍");
    assert_eq!(pats[2].r#type, ygo_search::types::PatternType::Flexible);
    assert_eq!(pats[2].query, "ブルーアイズ*");
}

#[test]
fn extract_patterns_include_start_index() {
    let _guard = lock_and_reset();
    let pats = fs::extract_card_patterns(
        "Use {card} here",
        &ExtractOptions {
            include_start_index: Some(true),
        },
    );
    assert_eq!(pats.len(), 1);
    assert_eq!(pats[0].start_index, Some(4));
}

// --- extract_and_search_cards ----------------------------------------------

#[test]
fn extract_and_search_exact_resolved() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    // 《青眼の白龍》 → ruby フォールバックで 1 件
    let m = fs::extract_and_search_cards("Use 《青眼の白龍》 card").unwrap();
    assert_eq!(m.len(), 1);
    assert_eq!(m[0].results.len(), 1);
    assert_eq!(m[0].results[0].card_id, "10000");
    assert_eq!(m[0].pattern, "《青眼の白龍》");
}

#[test]
fn extract_and_search_empty() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let m = fs::extract_and_search_cards("plain text without patterns").unwrap();
    assert!(m.is_empty());
}

// --- judge_and_replace ------------------------------------------------------

#[test]
fn judge_resolved_single_match() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::judge_and_replace("Use 《青眼の白龍》 card", &JudgeAndReplaceOptions::default())
        .unwrap();
    assert_eq!(r.processed_text, "Use {{青眼の白龍|10000}} card");
    assert!(!r.has_unprocessed);
    assert!(r.processed_patterns.iter().any(|p| p.status == ReplacementStatus::Resolved));
}

#[test]
fn judge_already_processed_name_matches() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r =
        fs::judge_and_replace("Use {{青眼の白龍|10000}} card", &JudgeAndReplaceOptions::default())
            .unwrap();
    assert_eq!(r.processed_text, "Use {{青眼の白龍|10000}} card");
    assert!(!r.has_unprocessed);
    assert!(r.processed_patterns.iter().any(|p| p.status == ReplacementStatus::AlreadyProcessed));
    assert!(r.warnings.is_empty());
}

#[test]
fn judge_corrected_card_name_mismatch() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r =
        fs::judge_and_replace("Use {{間違った名前|10000}} card", &JudgeAndReplaceOptions::default())
            .unwrap();
    assert_eq!(r.processed_text, "Use {{青眼の白龍|10000}} card");
    assert!(r.warnings.iter().any(|w| w.contains("カード名を修正")));
    assert!(r
        .warnings
        .iter()
        .any(|w| w.contains("間違った名前") && w.contains("青眼の白龍")));
    assert!(r.processed_patterns.iter().any(|p| p.status == ReplacementStatus::Corrected));
}

#[test]
fn judge_notfound() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r =
        fs::judge_and_replace("Use {NonExistentCard12345} here", &JudgeAndReplaceOptions::default())
            .unwrap();
    assert_eq!(r.processed_text, "Use {{NOTFOUND_`NonExistentCard12345`}} here");
    assert!(r.has_unprocessed);
    assert!(r.warnings.iter().any(|w| w.contains("no matches")));
    assert!(r.processed_patterns.iter().any(|p| p.status == ReplacementStatus::NotFound));
}

#[test]
fn judge_multiple_candidates() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new_multi();
    let r = fs::judge_and_replace("Use {青眼*} now", &JudgeAndReplaceOptions::default()).unwrap();
    assert_eq!(
        r.processed_text,
        "Use {{`青眼*`_`青眼の白龍|10000`_`青眼の亜白龍|10001`}} now"
    );
    assert!(r.has_unprocessed);
    assert!(r.warnings.iter().any(|w| w.contains("multiple matches")));
    assert!(r.processed_patterns.iter().any(|p| p.status == ReplacementStatus::Multiple));
}

#[test]
fn judge_mount_par_brackets() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::judge_and_replace(
        "Use 《青眼の白龍》",
        &JudgeAndReplaceOptions {
            mount_par: Some(true),
        },
    )
    .unwrap();
    assert_eq!(r.processed_text, "Use 《青眼の白龍》");
}

#[test]
fn judge_empty_text() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::judge_and_replace("Just plain text", &JudgeAndReplaceOptions::default()).unwrap();
    assert_eq!(r.processed_text, "Just plain text");
    assert!(!r.has_unprocessed);
    assert!(r.processed_patterns.is_empty());
    assert!(r.warnings.is_empty());
}

#[test]
fn judge_multiple_occurrences_all_replaced() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    // 同一パターンが 2 回出現 → 両方置換（processedPatterns は dedup で 1 件）
    let r = fs::judge_and_replace(
        "《青眼の白龍》 and 《青眼の白龍》",
        &JudgeAndReplaceOptions::default(),
    )
    .unwrap();
    assert_eq!(r.processed_text, "{{青眼の白龍|10000}} and {{青眼の白龍|10000}}");
    let resolved: Vec<_> = r
        .processed_patterns
        .iter()
        .filter(|p| p.status == ReplacementStatus::Resolved)
        .collect();
    assert_eq!(resolved.len(), 1);
}
