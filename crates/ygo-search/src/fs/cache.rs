//! モジュール級グローバルキャッシュ。TS `faq-loader.ts` の module 変数相当。
//!
//! 単一の `OnceLock<RwLock<FsCache>>` で全データセットを保持し、
//! `clear_cache()` で一括破棄する（TS `clearCache` と同等の原子性）。

use std::sync::{OnceLock, RwLock};

use crate::types::card::{Card, CardDetail};
use crate::types::faq::FAQRecord;

use super::FsError;

/// ロード済みデータセット（各 TSV のキャッシュ）。None = 未ロード。
struct FsCache {
    cards: Option<Vec<Card>>,
    details: Option<Vec<CardDetail>>,
    faqs: Option<Vec<FAQRecord>>,
}

impl FsCache {
    fn new() -> Self {
        Self {
            cards: None,
            details: None,
            faqs: None,
        }
    }
}

static CACHE: OnceLock<RwLock<FsCache>> = OnceLock::new();

fn cache() -> &'static RwLock<FsCache> {
    CACHE.get_or_init(|| RwLock::new(FsCache::new()))
}

/// cards キャッシュ経由ロード（hit: clone / miss: loader 実行→格納→clone）。
pub(crate) fn load_cards_cached(
    loader: impl FnOnce() -> Result<Vec<Card>, FsError>,
) -> Result<Vec<Card>, FsError> {
    {
        if let Some(ref cards) = cache().read().unwrap().cards {
            return Ok(cards.clone());
        }
    }
    let loaded = loader()?;
    cache().write().unwrap().cards = Some(loaded.clone());
    Ok(loaded)
}

/// details キャッシュ経由ロード。
pub(crate) fn load_details_cached(
    loader: impl FnOnce() -> Result<Vec<CardDetail>, FsError>,
) -> Result<Vec<CardDetail>, FsError> {
    {
        if let Some(ref details) = cache().read().unwrap().details {
            return Ok(details.clone());
        }
    }
    let loaded = loader()?;
    cache().write().unwrap().details = Some(loaded.clone());
    Ok(loaded)
}

/// faqs キャッシュ経由ロード。
pub(crate) fn load_faqs_cached(
    loader: impl FnOnce() -> Result<Vec<FAQRecord>, FsError>,
) -> Result<Vec<FAQRecord>, FsError> {
    {
        if let Some(ref faqs) = cache().read().unwrap().faqs {
            return Ok(faqs.clone());
        }
    }
    let loaded = loader()?;
    cache().write().unwrap().faqs = Some(loaded.clone());
    Ok(loaded)
}

/// 全キャッシュを破棄する（TS `clearCache` 相当）。次回ロードで再読込。
pub fn clear_cache() {
    let mut guard = cache().write().unwrap();
    guard.cards = None;
    guard.details = None;
    guard.faqs = None;
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::sync::Mutex;

    // グローバル static を触るためテストを直列化。
    static SERIAL: Mutex<()> = Mutex::new(());

    #[test]
    fn cache_hit_and_clear() {
        let _guard = SERIAL.lock().unwrap();
        clear_cache();

        let counter = AtomicUsize::new(0);
        let loader = || -> Result<Vec<Card>, FsError> {
            counter.fetch_add(1, Ordering::SeqCst);
            Ok(vec![])
        };

        // 初回: loader 呼出
        let _ = load_cards_cached(loader);
        // 2回目: キャッシュヒット（loader 呼ばれない）
        let _ = load_cards_cached(loader);
        assert_eq!(counter.load(Ordering::SeqCst), 1);

        clear_cache();
        // クリア後: loader 再呼出
        let _ = load_cards_cached(loader);
        assert_eq!(counter.load(Ordering::SeqCst), 2);

        clear_cache();
    }
}
