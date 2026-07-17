//! TSV 汎用フィルタエンジン（M2-T2）。
//!
//! TS `src/lib/card-search-core.ts` の `searchCards` 本体・`valueMatches` の忠実な Rust 移植。
//! `CardSearchParams`（`filter` / `cols` / `mode` / `includeRuby` / `flagAutoModify` /
//! `flagAllowWild`）を受け取り、メモリ上の `&[Card]` から合致行を抽出する。
//! TSV 読込は呼び出し側（[`super::search`]）が担い、本モジュールは純粋（ファイル IO なし）。
//!
//! `cols` 列投影は TS `card-search-core.ts` と同様に**エンジン内では未適用**（M0-T3 仕様 §6）。
//! TS では投影を呼び出し側パイプライン（seek 等）が担う。Rust も同等の境界とする。

use serde_json::Value;

use crate::normalize::normalize_for_search;
use crate::types::options::{CardSearchParams, SearchMode};
use crate::types::Card;

/// text 系カラム。`-"..."` 否定句を解釈する唯一のグループ（M0-T3 仕様 §3.3）。
const TEXT_COLUMNS: &[&str] = &[
    "text",
    "pendulumText",
    "supplementInfo",
    "pendulumSupplementInfo",
];

// =============================================================================
// 公開エントリ
// =============================================================================

/// メモリ上のカードリストから `params` に合致するカードを抽出する。
///
/// TS `searchCards` のフィルタリング本体（`card-search-core.ts:104-203`）の移植。
/// `filter` が空（制約なし）なら入力をそのまま返す。
pub fn filter_cards(cards: &[Card], params: &CardSearchParams) -> Vec<Card> {
    let mode = params.mode.unwrap_or(SearchMode::Exact);
    let include_ruby = params.include_ruby.unwrap_or(true);
    let flag_auto_modify = params.flag_auto_modify.unwrap_or(true);
    let flag_allow_wild = params.flag_allow_wild.unwrap_or(true);

    let filters = normalize_filter(&params.filter);
    if filters.is_empty() {
        return cards.to_vec();
    }

    cards
        .iter()
        .filter(|card| {
            card_matches(
                card,
                &filters,
                mode,
                include_ruby,
                flag_auto_modify,
                flag_allow_wild,
            )
        })
        .cloned()
        .collect()
}

/// FAQ の question/answer テキストマッチング（TS `matchesQuery`, `search-faq.ts:29-41`）。
///
/// - `query` 空 → 合致（true）
/// - wildcard（`flag_allow_wild && query.contains('*')`）→ `*` で分割し **非アンカー** で
///   `normalized` 内に出現順に含まれるか（`.*` 結合・case-insensitive）
/// - それ以外 → `normalized.includes(query.to_lowercase())`
///
/// 注意（TS 忠実）: `query` 側は `toLowerCase()` のみで `normalize_for_search` は未適用。
/// したがって query に記号/全角が含まれると normalized 側（記号除去済み）と合致しない場合がある。
pub(crate) fn matches_query(normalized: &str, query: &str, flag_allow_wild: bool) -> bool {
    if query.is_empty() {
        return true;
    }
    if flag_allow_wild && query.contains('*') {
        let parts: Vec<String> = query.split('*').map(|s| s.to_lowercase()).collect();
        return glob_contains(&parts, &normalized.to_lowercase());
    }
    normalized.contains(&query.to_lowercase())
}

// =============================================================================
// filter 正規化（TS NormalizedFilter）
// =============================================================================

/// 正規化済みフィルタ条件（TS `NormalizedFilter`）。
#[derive(Debug, Clone)]
struct NormalizedCondition {
    /// `true` = OR（いずれか合致）、`false` = AND（全合致）。
    op_is_or: bool,
    /// 各 cond を文字列化したもの。`None` は空相当（`null` / `undefined` / `""`）。
    conds: Vec<Option<String>>,
}

/// `filter` 生値（`Value::Object` 相当）を列ごとに正規化する（TS `searchCards` 本体 L115-127）。
///
/// - スカラー → `{ op:'and', cond:[v] }`
/// - 配列     → `{ op:'or',  cond:[...] }`（配列は OR）
/// - `{op,cond}` → `op === 'or'` のみ OR、他は AND。cond は配列ならそのまま、
///   スカラーなら `[cond]`、`null`/欠落なら `[]`
fn normalize_filter(raw: &Value) -> Vec<(String, NormalizedCondition)> {
    let mut out = Vec::new();
    if let Some(obj) = raw.as_object() {
        for (k, v) in obj {
            out.push((k.clone(), normalize_value(v)));
        }
    }
    out
}

fn normalize_value(v: &Value) -> NormalizedCondition {
    match v {
        // 配列は OR
        Value::Array(arr) => NormalizedCondition {
            op_is_or: true,
            conds: arr.iter().map(value_to_cond).collect(),
        },
        // { op, cond } 形式（op/cond キーを持つオブジェクトのみ）
        Value::Object(map) if map.contains_key("op") || map.contains_key("cond") => {
            let op_is_or = map.get("op").and_then(Value::as_str) == Some("or");
            let conds = match map.get("cond") {
                Some(Value::Array(arr)) => arr.iter().map(value_to_cond).collect(),
                Some(other) if !other.is_null() => vec![value_to_cond(other)],
                _ => Vec::new(),
            };
            NormalizedCondition { op_is_or, conds }
        }
        // スカラー（文字列/数値/真偽値/null）、および op/cond を持たないオブジェクト
        _ => NormalizedCondition {
            op_is_or: false,
            conds: vec![value_to_cond(v)],
        },
    }
}

/// cond 値を文字列化。`None` は空マッチ用（`null` / `""`）。
fn value_to_cond(v: &Value) -> Option<String> {
    match v {
        Value::Null => None,
        Value::String(s) if s.is_empty() => None,
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => Some(v.to_string()),
    }
}

// =============================================================================
// 列ごとのマッチング
// =============================================================================

/// 1カードが全フィルタ列を満たすか（列間は暗黙に AND）。
fn card_matches(
    card: &Card,
    filters: &[(String, NormalizedCondition)],
    mode: SearchMode,
    include_ruby: bool,
    flag_auto_modify: bool,
    flag_allow_wild: bool,
) -> bool {
    for (col, cond) in filters {
        // 空条件（cond 配列が空）は当該列の検査をスキップ（TS: f.cond.length === 0）
        if cond.conds.is_empty() {
            continue;
        }

        let is_name = col == "name";
        let is_text = TEXT_COLUMNS.contains(&col.as_str());
        // name 列のみ `mode` を適用、他列は常時 exact（TS: useMode = k==='name' ? mode : 'exact'）
        let eff_mode = if is_name { mode } else { SearchMode::Exact };
        let name_modified = if is_name {
            Some(card.name_modified.as_str())
        } else {
            None
        };
        let field_val = card_column(card, col);

        let passed = if cond.op_is_or {
            cond.conds.iter().any(|c| {
                cond_matches(
                    card,
                    &field_val,
                    c.as_deref(),
                    eff_mode,
                    is_name,
                    name_modified,
                    include_ruby,
                    flag_auto_modify,
                    flag_allow_wild,
                    is_text,
                )
            })
        } else {
            cond.conds.iter().all(|c| {
                cond_matches(
                    card,
                    &field_val,
                    c.as_deref(),
                    eff_mode,
                    is_name,
                    name_modified,
                    include_ruby,
                    flag_auto_modify,
                    flag_allow_wild,
                    is_text,
                )
            })
        };
        if !passed {
            return false;
        }
    }
    true
}

/// 1つの cond に対するマッチ（name 列の ruby フォールバック込み）。
#[allow(clippy::too_many_arguments)]
fn cond_matches(
    card: &Card,
    field_val: &str,
    cond: Option<&str>,
    mode: SearchMode,
    is_name: bool,
    name_modified: Option<&str>,
    include_ruby: bool,
    flag_auto_modify: bool,
    flag_allow_wild: bool,
    is_text: bool,
) -> bool {
    if value_matches(
        field_val,
        cond,
        mode,
        flag_auto_modify,
        name_modified,
        flag_allow_wild,
        is_text,
    ) {
        return true;
    }
    // name 列かつ includeRuby かつ非合着 → ruby 列で再マッチ
    // （mode 適用・正規化あり・wildcard 許可・text 否定句なし）
    if is_name && include_ruby {
        return value_matches(
            &card.ruby,
            cond,
            mode,
            flag_auto_modify,
            None,
            flag_allow_wild,
            false,
        );
    }
    false
}

/// TS `valueMatches`（`card-search-core.ts:38-98`）の忠実な移植。
#[allow(clippy::too_many_arguments)]
fn value_matches(
    field_value: &str,
    cond: Option<&str>,
    mode: SearchMode,
    flag_auto_modify: bool,
    name_modified: Option<&str>,
    flag_allow_wild: bool,
    is_text_field: bool,
) -> bool {
    // 空 cond（null/undefined/""）→ 空フィールドに合致
    let cond_str = match cond {
        Some(s) => s,
        None => return field_value.is_empty(),
    };

    // wildcard は正規化前に判定
    let has_wildcard = flag_allow_wild && cond_str.contains('*');

    // searchTarget: name 列かつ nameModified 存在ならそれ（正規化済み扱い）、
    //               さもなくば flagAutoModify 時に fieldValue を正規化。
    let target_owned: String;
    let search_target: &str = if flag_auto_modify {
        match name_modified {
            Some(nm) => nm,
            None => {
                target_owned = normalize_for_search(field_value);
                &target_owned
            }
        }
    } else {
        field_value
    };

    // searchPattern: wildcard なら * で分割して各部正規化後に再結合、さもなくば正規化。
    let mut search_pattern = build_pattern(cond_str, has_wildcard, flag_auto_modify);

    // text 否定句（text 系カラムのみ）
    if is_text_field && cond_str.contains("-\"") {
        let negatives = extract_negatives(cond_str);
        if !negatives.is_empty() {
            for phrase in &negatives {
                let np = if flag_auto_modify {
                    normalize_for_search(phrase)
                } else {
                    phrase.clone()
                };
                if search_target.contains(&np) {
                    return false;
                }
            }
            // 否定句を除去した残りで再マッチ。残り空なら採用（true）。
            let stripped = strip_negatives(cond_str);
            let stripped = stripped.trim();
            if stripped.is_empty() {
                return true;
            }
            search_pattern = build_pattern(stripped, has_wildcard, flag_auto_modify);
        }
    }

    // partial モードは wildcard より優先（TS: card-search-core.ts:87-89）
    if mode == SearchMode::Partial {
        return search_target.contains(&search_pattern);
    }

    if has_wildcard {
        // `^p0.*p1.*....*pn$`（case-insensitive は双方 lowercase で再現）
        let parts: Vec<String> = search_pattern.split('*').map(|s| s.to_lowercase()).collect();
        return glob_match(&parts, &search_target.to_lowercase());
    }

    search_target == search_pattern
}

/// wildcard 用パターン構築（`flag_auto_modify` 時に正規化、`*` 保持）。
fn build_pattern(cond: &str, has_wildcard: bool, flag_auto_modify: bool) -> String {
    if has_wildcard && flag_auto_modify {
        cond.split('*')
            .map(normalize_for_search)
            .collect::<Vec<_>>()
            .join("*")
    } else if flag_auto_modify {
        normalize_for_search(cond)
    } else {
        cond.to_string()
    }
}

// =============================================================================
// wildcard（`*`）マッチング — regex コンパイルを避ける自前実装
// =============================================================================

/// `^p0.*p1.*....*pn$` マッチ（`parts` は `*` 分割済み）。
///
/// 両端アンカー版。`partial`/exact 列マッチの wildcard で使用。
/// 先頭パートは先頭一致、中間パートは最初の出現へ貪欲進行、末尾パートは残りの末尾一致。
fn glob_match(parts: &[String], target: &str) -> bool {
    if parts.is_empty() {
        return target.is_empty();
    }
    if !target.starts_with(&parts[0]) {
        return false;
    }
    let mut pos = parts[0].len();
    let n = parts.len();
    // 中間パート（1..n-1）
    if n > 2 {
        for p in &parts[1..n - 1] {
            if p.is_empty() {
                continue;
            }
            match target[pos..].find(p) {
                Some(idx) => pos += idx + p.len(),
                None => return false,
            }
        }
    }
    if n == 1 {
        return pos == target.len();
    }
    target[pos..].ends_with(&parts[n - 1])
}

/// 非アンカー版: `p0.*p1.*....*pn` が `target` 内に出現順に含まれるか。
///
/// FAQ `matchesQuery` の wildcard（TS は `^`/`$` 無しの RegExp）で使用。
fn glob_contains(parts: &[String], target: &str) -> bool {
    let mut pos = 0usize;
    for p in parts {
        if p.is_empty() {
            continue;
        }
        match target[pos..].find(p) {
            Some(idx) => pos += idx + p.len(),
            None => return false,
        }
    }
    true
}

// =============================================================================
// text 否定句（`-"..."`） — regex はコンパイル一度きり
// =============================================================================

static NEG_RE: std::sync::OnceLock<regex::Regex> = std::sync::OnceLock::new();

/// `-["'\`]([^"'\`]+)["'\`]`（TS `card-search-core.ts:67,76`）。
/// 開閉の引用符は `"`, `'`, `` ` `` のいずれか（開閉で異なってよい）。
fn neg_regex() -> &'static regex::Regex {
    NEG_RE.get_or_init(|| {
        regex::Regex::new(r#"-["'`]([^"'`]+)["'`]"#).expect("valid negative-phrase regex")
    })
}

/// 否定フレーズ（引用符内）を全件抽出。
fn extract_negatives(cond: &str) -> Vec<String> {
    neg_regex()
        .captures_iter(cond)
        .map(|c| c[1].to_string())
        .collect()
}

/// 否定フレーズを全件除去。
fn strip_negatives(cond: &str) -> String {
    neg_regex().replace_all(cond, "").to_string()
}

// =============================================================================
// Card → カラム文字列値
// =============================================================================

/// カラム名（camelCase・TSV ヘッダと同一）から `Card` の生文字列値を取り出す。
///
/// TS は `obj[k]`（TSV セル生値）で比較する。enum フィールドは直列化値（`"dark"` 等）へ
/// 戻すことで TS の文字列比較と一致させる。未知カラムは `""`。
fn card_column(card: &Card, col: &str) -> String {
    match col {
        "cardType" => enum_str(&card.card_type),
        "name" => card.name.clone(),
        "nameModified" => card.name_modified.clone(),
        "ruby" => card.ruby.clone(),
        "cardId" => card.card_id.clone(),
        "ciid" => card.ciid.clone().unwrap_or_default(),
        "imgs" => card.imgs.clone().unwrap_or_default(),
        "text" => card.text.clone().unwrap_or_default(),
        "attribute" => card.attribute.as_ref().map(enum_str).unwrap_or_default(),
        "levelType" => card.level_type.as_ref().map(enum_str).unwrap_or_default(),
        "levelValue" => card.level_value.clone().unwrap_or_default(),
        "race" => card.race.as_ref().map(enum_str).unwrap_or_default(),
        "monsterTypes" => card.monster_types.clone().unwrap_or_default(),
        "atk" => card.atk.clone().unwrap_or_default(),
        "def" => card.def.clone().unwrap_or_default(),
        "linkMarkers" => card.link_markers.clone().unwrap_or_default(),
        "pendulumScale" => card.pendulum_scale.clone().unwrap_or_default(),
        "pendulumText" => card.pendulum_text.clone().unwrap_or_default(),
        "isExtraDeck" => card.is_extra_deck.clone().unwrap_or_default(),
        "spellEffectType" => card
            .spell_effect_type
            .as_ref()
            .map(enum_str)
            .unwrap_or_default(),
        "trapEffectType" => card
            .trap_effect_type
            .as_ref()
            .map(enum_str)
            .unwrap_or_default(),
        _ => String::new(),
    }
}

/// enum を serde 直列化値（`"dark"` / `"quick"` / `"beastwarrior"` 等）へ。
fn enum_str<T: serde::Serialize>(v: &T) -> String {
    serde_json::to_value(v)
        .ok()
        .and_then(|x| x.as_str().map(String::from))
        .unwrap_or_default()
}

// =============================================================================
// ユニットテスト（M0-T3 仕様 §8 fixture を golden 化）
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::card::{Attribute, CardType, Race};
    use crate::types::options::SearchMode;

    /// テスト用カード。`name`/`name_modified`/`ruby`/`card_id` と必要列のみ実値。
    /// `name_modified` は TS の `nameModified`（`normalizeForSearch(name)` 相当）。
    fn mk(card_id: &str, name: &str, name_modified: &str, ruby: &str) -> Card {
        Card {
            card_type: CardType::Monster,
            name: name.to_string(),
            name_modified: name_modified.to_string(),
            ruby: ruby.to_string(),
            card_id: card_id.to_string(),
            ciid: None,
            imgs: None,
            text: None,
            attribute: None,
            level_type: None,
            level_value: None,
            race: None,
            monster_types: None,
            atk: None,
            def: None,
            link_markers: None,
            pendulum_scale: None,
            pendulum_text: None,
            is_extra_deck: None,
            spell_effect_type: None,
            trap_effect_type: None,
        }
    }

    fn sample_cards() -> Vec<Card> {
        vec![
            {
                let mut c = mk("10000", "青眼の白龍", "青眼ノ白龍", "青眼の白龍");
                c.attribute = Some(Attribute::Dark);
                c.race = Some(Race::Dragon);
                c
            },
            {
                let mut c = mk("10001", "青眼の白き龍", "青眼ノ白キ龍", "ブルーアイズ");
                c.attribute = Some(Attribute::Light);
                c.race = Some(Race::Dragon);
                c
            },
            // name_modified が完全に "青眼"（exact マッチ用）
            {
                let mut c = mk("10002", "青眼", "青眼", "青眼");
                c.attribute = Some(Attribute::Dark);
                c
            },
            // name OR に合致するが attribute が dark でない（AND 除外確認用）
            {
                let mut c = mk("10003", "青眼", "青眼", "青眼");
                c.attribute = Some(Attribute::Light);
                c
            },
            mk("20000", "ブラック・マジシャン", "ブラックマジシャン", "ブラックマジシャン"),
        ]
    }

    fn search(cards: &[Card], filter: serde_json::Value) -> Vec<Card> {
        filter_cards(
            cards,
            &CardSearchParams {
                filter,
                cols: None,
                mode: None,
                include_ruby: None,
                flag_auto_modify: None,
                flag_allow_wild: None,
            },
        )
    }

    fn ids(r: &[Card]) -> Vec<&str> {
        let mut v: Vec<&str> = r.iter().map(|c| c.card_id.as_str()).collect();
        v.sort();
        v
    }

    // --- M0-T3 仕様 §8 fixture（TS 実装の挙動に合わせ exact 既定） -----------

    #[test]
    fn name_exact_with_normalization() {
        // name 列 exact マッチ（正規化で 龍 統一）。
        // 10000: name_modified="青眼ノ白龍"。normalize("青眼の白龍")="青眼ノ白龍" → 直接合致。
        let cards = sample_cards();
        let r = search(&cards, serde_json::json!({ "name": "青眼の白龍" }));
        assert_eq!(ids(&r), vec!["10000"]);
    }

    #[test]
    fn name_ruby_fallback() {
        // name_modified が合わないが ruby で合致するケース（includeRuby=true 既定）。
        let card = mk("1", "表示名", "zzz", "青眼の白龍");
        let r = search(std::slice::from_ref(&card), serde_json::json!({ "name": "青眼の白龍" }));
        assert_eq!(ids(&r), vec!["1"]);
    }

    #[test]
    fn cardid_array_is_or() {
        // cardId 配列 = OR。いずれかに合致。
        let cards = sample_cards();
        let r = search(&cards, serde_json::json!({ "cardId": ["10000", "10001"] }));
        assert_eq!(ids(&r), vec!["10000", "10001"]);
    }

    #[test]
    fn name_or_group_with_attribute_and() {
        // name OR(青眼|ブラック) AND attribute=='dark'（exact）。
        // "青眼" exact に合致するのは name_modified=="青眼" の 10002/10003。
        // attribute dark なのは 10002 のみ（10003 は light → AND で除外）。
        let cards = sample_cards();
        let r = search(
            &cards,
            serde_json::json!({
                "name": { "op": "or", "cond": ["青眼", "ブラック"] },
                "attribute": "dark"
            }),
        );
        assert_eq!(ids(&r), vec!["10002"]);
    }

    #[test]
    fn name_wildcard_exact_mode() {
        // wildcard。「青眼」始まり（name_modified に対して ^青眼.*$）。
        let cards = sample_cards();
        let r = search(&cards, serde_json::json!({ "name": "青眼*" }));
        assert_eq!(ids(&r), vec!["10000", "10001", "10002", "10003"]);
    }

    #[test]
    fn text_negative_phrase_and_exact_semantics() {
        // text 既定は exact（===）。否定句除去後の残りも exact で照合。
        let mut a = mk("1", "A", "a", "a");
        a.text = Some("ドラゴン".into()); // normalize 後も "ドラゴン"
        let mut b = mk("2", "B", "b", "b");
        b.text = Some("青眼ドラゴン".into()); // 否定句 "青眼" を含む → 不採用
        let mut c = mk("3", "C", "c", "c");
        c.text = Some("ドラゴンブルーアイズ".into()); // 否定句無し、残り "ドラゴン" != 全体 → exact 不一致

        let cards = vec![a, b, c];
        let r = search(&cards, serde_json::json!({ "text": "ドラゴン -\"青眼\"" }));
        assert_eq!(ids(&r), vec!["1"]);
    }

    #[test]
    fn text_column_default_is_exact_not_contains() {
        // text 列は mode 適用外（常時 exact）。部分一致しない。
        let mut card = mk("1", "A", "a", "a");
        card.text = Some("ドラゴンブルーアイズ".into());
        let cards = std::slice::from_ref(&card);
        assert!(search(cards, serde_json::json!({ "text": "ドラゴン" })).is_empty());
        assert_eq!(
            ids(&search(cards, serde_json::json!({ "text": "ドラゴンブルーアイズ" }))),
            vec!["1"]
        );
    }

    #[test]
    fn name_partial_mode_with_ruby_fallback() {
        // name partial（部分一致）。非合致なら ruby 列で部分一致。
        let cards = sample_cards();
        let r = filter_cards(
            &cards,
            &CardSearchParams {
                filter: serde_json::json!({ "name": "ブルーアイズ" }),
                mode: Some(SearchMode::Partial),
                include_ruby: Some(true),
                ..Default::default()
            },
        );
        // 10001 ruby="ブルーアイズ" → partial 合致。
        assert_eq!(ids(&r), vec!["10001"]);
    }

    #[test]
    fn name_normalization_katakana() {
        // flagAutoModify でひらがな→カタカナ吸収。
        let card = mk("1", "あいうえお", "アイウエオ", "アイウエオ");
        let r = search(std::slice::from_ref(&card), serde_json::json!({ "name": "あいうえお" }));
        assert_eq!(ids(&r), vec!["1"]);
    }

    #[test]
    fn empty_filter_returns_all() {
        let cards = sample_cards();
        let r = search(&cards, serde_json::json!({}));
        assert_eq!(r.len(), 5);
    }

    #[test]
    fn empty_cond_matches_empty_field() {
        // 空 cond（""）→ 空フィールドに合致。空でないフィールドには合致しない。
        let mut full = mk("1", "A", "a", "a");
        full.attribute = Some(Attribute::Dark);
        let mut empty_attr = mk("2", "B", "b", "b");
        empty_attr.attribute = None;
        let cards = vec![full, empty_attr];
        let r = search(&cards, serde_json::json!({ "attribute": "" }));
        assert_eq!(ids(&r), vec!["2"]);
    }

    #[test]
    fn unknown_column_never_matches_nonempty() {
        let cards = sample_cards();
        let r = search(&cards, serde_json::json!({ "noSuchColumn": "x" }));
        assert!(r.is_empty());
    }

    // --- value_matches / glob 直接検証 ---------------------------------------

    #[test]
    fn glob_match_anchored() {
        assert!(glob_match(&["a".into()], "a"));
        assert!(!glob_match(&["a".into()], "ab"));
        assert!(glob_match(&["a".into(), "b".into()], "axb"));
        assert!(glob_match(&["a".into(), "b".into()], "ab"));
        assert!(!glob_match(&["a".into(), "b".into()], "a"));
        assert!(glob_match(&["a".into(), "c".into(), "d".into()], "axcycd"));
        // 3 パート: ^a.*b.*a$ は "aba" に合致（a→b→a の順）、"abc" には不合致
        assert!(glob_match(&["a".into(), "b".into(), "a".into()], "aba"));
        assert!(!glob_match(&["a".into(), "b".into(), "a".into()], "abc"));
        // leading/trailing/double star
        assert!(glob_match(&["".into(), "b".into()], "xb"));
        assert!(glob_match(&["a".into(), "".into()], "ax"));
        assert!(glob_match(&["".into(), "".into()], "xyz"));
    }

    #[test]
    fn glob_contains_unanchored() {
        assert!(glob_contains(&["ドラ".into(), "ン".into()], "ブルドラゴン"));
        assert!(!glob_contains(&["ズ".into(), "ドラ".into()], "ドラゴンズ"));
        assert!(glob_contains(&["".into()], "anything"));
    }

    #[test]
    fn matches_query_semantics() {
        // query 空 → true
        assert!(matches_query("ドラゴン", "", true));
        // 非wildcard: normalized.includes(query.to_lowercase())
        assert!(matches_query("ブルーアイズ", "ブルー", false));
        assert!(!matches_query("ブルーアイズ", "レッド", false));
        // wildcard 非アンカー
        assert!(matches_query("ブルーアイズドラゴン", "ブルー*", true));
        assert!(matches_query("ブルーアイズドラゴン", "*ドラゴン", true));
    }

    #[test]
    fn extract_and_strip_negatives() {
        assert_eq!(extract_negatives(r#"ドラゴン -"青眼" -'赤'"#), vec!["青眼", "赤"]);
        assert_eq!(strip_negatives(r#"ドラゴン -"青眼" -'赤'"#), "ドラゴン  ");
    }

    #[test]
    fn enum_str_uses_serde_value() {
        assert_eq!(enum_str(&Attribute::Dark), "dark");
        assert_eq!(enum_str(&Race::BeastWarrior), "beastwarrior");
    }
}
