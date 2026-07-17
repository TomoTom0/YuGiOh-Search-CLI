//! TS 互換ラッパ API（M2-T2）。
//!
//! TSV 読込（[`super::tsv`]）→ 汎用フィルタエンジン（[`super::filter`]）→ 投影、のパイプラインを
//! 公開関数として提供する。TS `src/index.ts` 公開面の Rust 版:
//! `searchCards` / `searchFAQ` / `loadFAQIndex` / `getCardsByIds` / `extractCardReferences`。
//!
//! 参照:
//! - `src/lib/card-search-core.ts`（searchCards）
//! - `src/search-faq.ts`（searchFAQ / matchesQuery）
//! - `src/utils/faq-loader.ts`（loadFAQIndex / getCardsByIds / extractCardReferences）

use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};

use crate::normalize::normalize_for_search;
use crate::types::options::{CardSearchParams, SearchFAQParams};
use crate::types::{Card, CardReference, FAQIndex, FAQIndexEntry, FAQRecord, FAQSearchResult, FAQWithCards};

use super::filter::{filter_cards, matches_query};
use super::{load_cards, load_faqs, FsError};

// =============================================================================
// カード検索
// =============================================================================

/// `searchCards(params) -> Card[]`（TS `card-search-core.ts`）。
///
/// TSV をキャッシュ経由で読み込み、汎用フィルタエンジンで抽出する。
/// `cols` は TS core と同様にエンジン内では未適用（投影は呼び出し側パイプライン担当）。
pub fn search_cards(params: &CardSearchParams) -> Result<Vec<Card>, FsError> {
    let cards = load_cards()?;
    Ok(filter_cards(&cards, params))
}

/// `getCardsByIds(ids) -> Card[]`（TS `faq-loader.ts`）。
///
/// 入力 `ids` 順にカードを返す。重複 id は最初の出現のみ（dedup）。
/// 不在の id は黙ってスキップ（エラーにしない）。
pub fn get_cards_by_ids(ids: &[&str]) -> Result<Vec<Card>, FsError> {
    let cards = load_cards()?;
    let idx: HashMap<&str, &Card> = cards.iter().map(|c| (c.card_id.as_str(), c)).collect();
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for id in ids {
        if !seen.insert(*id) {
            continue;
        }
        if let Some(c) = idx.get(id) {
            out.push((*c).clone());
        }
    }
    Ok(out)
}

// =============================================================================
// FAQ 検索
// =============================================================================

/// `searchFAQ(params) -> FAQSearchResult[]`（TS `search-faq.ts`）。
///
/// 優先度順に早期リターン: `faqId` → `cardId` → `cardName` → `cardFilter` →
/// `question`/`answer` テキスト検索。`limit`（既定 50）・`flagAllowWild`（既定 true）。
/// 本関数はスコアリングを行わない（TS と同様、`score` は設定されない）。
pub fn search_faq(params: &SearchFAQParams) -> Result<Vec<FAQSearchResult>, FsError> {
    let limit = params.limit.unwrap_or(50) as usize;
    let flag_allow_wild = params.flag_allow_wild.unwrap_or(true);

    let index = load_faq_index()?;
    let cards = load_cards()?;

    // --- faqId: 1件 lookup ---
    if let Some(faq_id) = params.faq_id {
        return Ok(index
            .by_id
            .get(&faq_id)
            .map(|r| vec![enrich(r, &cards)])
            .unwrap_or_default());
    }

    // --- cardId: byCardId の faqIds（格納順・ソート無し）を slice ---
    if let Some(card_id) = params.card_id {
        let faq_ids: Vec<u32> = index
            .by_card_id
            .get(&card_id)
            .map(|ids| ids.iter().copied().take(limit).collect())
            .unwrap_or_default();
        return Ok(resolve_faqs(&faq_ids, &index, &cards));
    }

    // --- cardName: searchCards({name}) → cardIds → byCardId の faqIds を union & sort ---
    if let Some(card_name) = &params.card_name {
        let card_ids = search_card_ids_by_filter(&serde_json::json!({ "name": card_name }));
        let faq_ids = collect_faq_ids_sorted(&card_ids, &index, limit);
        return Ok(resolve_faqs(&faq_ids, &index, &cards));
    }

    // --- cardFilter: searchCards(cardFilter) → 同上 ---
    if let Some(card_filter) = &params.card_filter {
        let card_ids = search_card_ids_by_filter(card_filter);
        let faq_ids = collect_faq_ids_sorted(&card_ids, &index, limit);
        return Ok(resolve_faqs(&faq_ids, &index, &cards));
    }

    // --- question/answer テキスト検索（byId 順 = faqId 昇順、early-break） ---
    let mut results = Vec::new();
    for (id, rec) in &index.by_id {
        let norm = match index.normalized.get(id) {
            Some(n) => n,
            None => continue,
        };
        let mut matched = true;
        if let Some(q) = &params.question {
            matched &= matches_query(&norm.question, q, flag_allow_wild);
        }
        if let Some(a) = &params.answer {
            matched &= matches_query(&norm.answer, a, flag_allow_wild);
        }
        if matched {
            results.push(enrich(rec, &cards));
            if results.len() >= limit {
                break;
            }
        }
    }
    Ok(results)
}

/// `loadFAQIndex() -> FAQIndex`（TS `faq-loader.ts`）。
///
/// `byId` / `normalized`（normalize_for_search 済み）/ `byCardId` を構築する。
/// TSV パースはキャッシュ済み（[`load_faqs`]）。マップ構築は呼出毎（線形）。
pub fn load_faq_index() -> Result<FAQIndex, FsError> {
    let faqs = load_faqs()?;
    let mut by_id: BTreeMap<u32, FAQRecord> = BTreeMap::new();
    let mut normalized: BTreeMap<u32, FAQIndexEntry> = BTreeMap::new();
    let mut by_card_id: BTreeMap<u32, Vec<u32>> = BTreeMap::new();

    for f in &faqs {
        by_id.insert(f.faq_id, f.clone());
        normalized.insert(
            f.faq_id,
            FAQIndexEntry {
                question: normalize_for_search(&f.question),
                answer: normalize_for_search(&f.answer),
            },
        );
        // 1 FAQ 内の重複 cardId は Set で除外（TS 忠実）
        let q_refs = extract_card_references(&f.question);
        let a_refs = extract_card_references(&f.answer);
        let mut seen = HashSet::new();
        for r in q_refs.iter().chain(a_refs.iter()) {
            if seen.insert(r.card_id) {
                by_card_id.entry(r.card_id).or_default().push(f.faq_id);
            }
        }
    }

    Ok(FAQIndex {
        by_id,
        by_card_id,
        normalized,
    })
}

/// `extractCardReferences(text) -> CardReference[]`（TS `faq-loader.ts:10-24`）。
///
/// `{{name|id}}` 形式の参照を全件抽出する（出現順保持）。
pub fn extract_card_references(text: &str) -> Vec<CardReference> {
    static REF_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();
    let re = REF_RE.get_or_init(|| {
        regex::Regex::new(r"\{\{([^|]+)\|(\d+)\}\}").expect("valid card-reference regex")
    });
    re.captures_iter(text)
        .map(|c| CardReference {
            card_id: c[2].parse::<u32>().unwrap_or(0),
            card_name: c[1].to_string(),
            position: c.get(0).map(|m| m.start() as i64).unwrap_or(0),
        })
        .collect()
}

// =============================================================================
// 内部ヘルパ
// =============================================================================

/// `searchCardsByFilter`（TS `search-faq.ts:69-73`）: filter でカードを検索し
/// `cardId` を数値化（変換不可は除外）。
fn search_card_ids_by_filter(filter: &serde_json::Value) -> Vec<u32> {
    let cards = load_cards().unwrap_or_default();
    let params = CardSearchParams {
        filter: filter.clone(),
        ..Default::default()
    };
    filter_cards(&cards, &params)
        .iter()
        .filter_map(|c| c.card_id.parse::<u32>().ok())
        .collect()
}

/// cardName/cardFilter ブランチ: cardIds → 各 byCardId の faqIds を union し、
/// faqId 昇順ソート → `limit` まで（TS `search-faq.ts:110-118,137-141`）。
fn collect_faq_ids_sorted(card_ids: &[u32], index: &FAQIndex, limit: usize) -> Vec<u32> {
    let mut set: BTreeSet<u32> = BTreeSet::new();
    for cid in card_ids {
        if let Some(ids) = index.by_card_id.get(cid) {
            set.extend(ids.iter().copied());
        }
    }
    set.into_iter().take(limit).collect()
}

/// faqIds → enrich 済み FAQSearchResult（byId に無い id はスキップ）。
fn resolve_faqs(faq_ids: &[u32], index: &FAQIndex, cards: &[Card]) -> Vec<FAQSearchResult> {
    faq_ids
        .iter()
        .filter_map(|id| index.by_id.get(id).map(|r| enrich(r, cards)))
        .collect()
}

/// FAQ レコードをカード情報付きへ展開（TS `enrichFAQWithCards`, `search-faq.ts:43-67`）。
///
/// `questionCards`/`answerCards` は参照の出現順を保ち、不在カードを除外。
/// `allCardIds` は question → answer の順でユニーク化。
fn enrich(rec: &FAQRecord, cards: &[Card]) -> FAQSearchResult {
    let idx: HashMap<String, &Card> = cards.iter().map(|c| (c.card_id.clone(), c)).collect();

    let q_refs = extract_card_references(&rec.question);
    let a_refs = extract_card_references(&rec.answer);

    let question_cards = resolve_cards_in_order(&q_refs, &idx);
    let answer_cards = resolve_cards_in_order(&a_refs, &idx);

    let mut all_card_ids = Vec::new();
    for r in q_refs.iter().chain(a_refs.iter()) {
        if !all_card_ids.contains(&r.card_id) {
            all_card_ids.push(r.card_id);
        }
    }

    FAQSearchResult {
        faq: FAQWithCards {
            record: rec.clone(),
            question_cards,
            answer_cards,
            all_card_ids,
        },
        score: None,
    }
}

/// 参照リストを順に解決し、存在するカードのみ出現順で返す。
fn resolve_cards_in_order(refs: &[CardReference], idx: &HashMap<String, &Card>) -> Vec<Card> {
    refs.iter()
        .filter_map(|r| idx.get(&r.card_id.to_string()).map(|c| (*c).clone()))
        .collect()
}
