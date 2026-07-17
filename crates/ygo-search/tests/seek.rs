//! fs feature: seek_cards の統合テスト。
//!
//! fixture cards-all.tsv（cardId 10000 / 20000 / 30000 の 3 枚）を一時 workdir に置き、
//! ランダム/範囲/先頭 N 件の選択とバリデーションを検証する。
#![cfg(feature = "fs")]

use std::path::PathBuf;
use std::sync::Mutex;

use ygo_search::fs::{self, clear_cache};
use ygo_search::types::options::SeekCardsOptions;

// グローバルキャッシュと env を触るため、本バイナリ内のテストを直列化。
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
    /// `SERIAL` ガード保持下で呼ぶこと。
    fn new() -> Self {
        let dir = tempfile::tempdir().expect("tempdir");
        let tsv_dir = dir.path().join("data").join("tsv");
        std::fs::create_dir_all(&tsv_dir).unwrap();
        std::fs::copy(fixture("cards-all.tsv"), tsv_dir.join("cards-all.tsv")).unwrap();
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

fn ids(cards: &[ygo_search::types::Card]) -> Vec<&str> {
    cards.iter().map(|c| c.card_id.as_str()).collect()
}

#[test]
fn seek_range_all() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    // range [10000,20000] + all → 2 枚（TSV 行順）
    let r = fs::seek_cards(&SeekCardsOptions {
        range: Some([10000, 20000]),
        all: Some(true),
        random: Some(false),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(ids(&r), vec!["10000", "20000"]);
}

#[test]
fn seek_take_first_n() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    // random=false → 先頭 max 件（TSV 行順）
    let r = fs::seek_cards(&SeekCardsOptions {
        max: Some(2),
        random: Some(false),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(ids(&r), vec!["10000", "20000"]);
}

#[test]
fn seek_random_within_bounds() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::seek_cards(&SeekCardsOptions {
        max: Some(10),
        random: Some(true),
        ..Default::default()
    })
    .unwrap();
    // 3 枚しか無いので全件（max 上限には届かない）
    assert_eq!(r.len(), 3);
    for c in &r {
        assert!(["10000", "20000", "30000"].contains(&c.card_id.as_str()));
    }
}

#[test]
fn seek_random_respects_max_and_range() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let r = fs::seek_cards(&SeekCardsOptions {
        max: Some(1),
        random: Some(true),
        range: Some([10000, 30000]),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(r.len(), 1);
    assert!(["10000", "20000", "30000"].contains(&r[0].card_id.as_str()));
}

#[test]
fn seek_defaults_returns_all() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    // 既定 max=10, random=true → min(10,3)=3 件
    let r = fs::seek_cards(&SeekCardsOptions::default()).unwrap();
    assert_eq!(r.len(), 3);
}

#[test]
fn seek_all_without_range_errors() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    let res = fs::seek_cards(&SeekCardsOptions {
        all: Some(true),
        ..Default::default()
    });
    assert!(res.is_err());
}

#[test]
fn seek_range_excludes_non_numeric() {
    let _guard = lock_and_reset();
    let _wd = Workdir::new();
    // 範囲外の cardId は除外（fixture に非数値は無いが、範囲外で絞り込めることを確認）
    let r = fs::seek_cards(&SeekCardsOptions {
        range: Some([30000, 30000]),
        all: Some(true),
        ..Default::default()
    })
    .unwrap();
    assert_eq!(ids(&r), vec!["30000"]);
}
