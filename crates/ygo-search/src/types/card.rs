//! TS 公開型面（`src/types/card.ts`）に一致する serde DTO・列挙型群。
//!
//! M0-T2「契約凍結」: TS 実型と同じ JSON 形状で直列化・復元できることを保証する。
//! 実検索ロジックへの結線は M1-T1 で行う（本モジュールは純粋な型定義）。

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// 列挙型（TS `src/types/card.ts` の文字列リテラル型に一致）
// ---------------------------------------------------------------------------

/// カード種別 (`'monster' | 'spell' | 'trap'`)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CardType {
    Monster,
    Spell,
    Trap,
}

/// 属性
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Attribute {
    Dark,
    Divine,
    Earth,
    Fire,
    Light,
    Water,
    Wind,
}

/// レベル種別 (`'level' | 'rank' | 'link'`)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LevelType {
    Level,
    Rank,
    Link,
}

/// 種族。多語種は連結小文字（`beastwarrior`, `seaserpent`, `windbeast`）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Race {
    Aqua,
    Beast,
    BeastWarrior,
    CreatorGod,
    Cyberse,
    Dinosaur,
    Divine,
    Dragon,
    Fairy,
    Fiend,
    Fish,
    Illusion,
    Insect,
    Machine,
    Plant,
    Psychic,
    Pyro,
    Reptile,
    Rock,
    SeaSerpent,
    Spellcaster,
    Thunder,
    Warrior,
    WindBeast,
    Wyrm,
    Zombie,
}

/// モンスター種別（複数指定可能・JSON 配列として保持）
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MonsterType {
    Normal,
    Effect,
    Fusion,
    Ritual,
    Synchro,
    Xyz,
    Link,
    Pendulum,
    Tuner,
    Spirit,
    Union,
    Gemini,
    Flip,
    Toon,
    Special,
}

/// 魔法カードの効果種別。
///
/// TS `schema.md`/`card.ts` は `'quick'`。`converter.ts` の `'quickPlay'` と不一致 → M0-T3 で解決。
/// 本契約は権威である schema.md に合わせ `quick` とする。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SpellEffectType {
    Normal,
    #[serde(rename = "quick")]
    QuickPlay,
    Continuous,
    Equip,
    Field,
    Ritual,
}

/// 罠カードの効果種別
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrapEffectType {
    Normal,
    Continuous,
    Counter,
}

/// リンクマーカー（ケバブケース: `top-left` 等）
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LinkMarker {
    Top,
    Bottom,
    Left,
    Right,
    TopLeft,
    TopRight,
    BottomLeft,
    BottomRight,
}

/// パターン抽出種別。`'cardId'` は camelCase（lowercase ではない）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PatternType {
    Flexible,
    Exact,
    #[serde(rename = "cardId")]
    CardId,
}

// ---------------------------------------------------------------------------
// Card DTO（`src/types/card.ts` の `Card` interface に一致）
// ---------------------------------------------------------------------------

/// `cards-all.tsv` 1 行に相当するカード DTO。
///
/// 多くのフィールドが TS と同様に文字列（`atk?: string` 等）。
/// JSON 配列フィールド（`imgs`, `monsterTypes`, `linkMarkers`）は
/// TS 同様に JSON 文字列として保持する。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub card_type: CardType,
    pub name: String,
    pub name_modified: String,
    pub ruby: String,
    pub card_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ciid: Option<String>,
    /// JSON 配列の文字列表現（`["url1", ...]`）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub imgs: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    // モンスター固有
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attribute: Option<Attribute>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level_type: Option<LevelType>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level_value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub race: Option<Race>,
    /// JSON 配列の文字列表現（`["normal", "effect"]`）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub monster_types: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub atk: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub def: Option<String>,
    /// JSON 配列の文字列表現（`["top", "bottom-left"]`）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub link_markers: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pendulum_scale: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pendulum_text: Option<String>,
    /// `"true"` or 空文字列（false 相当）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_extra_deck: Option<String>,
    // 魔法
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub spell_effect_type: Option<SpellEffectType>,
    // 罠
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub trap_effect_type: Option<TrapEffectType>,
}

// ---------------------------------------------------------------------------
// detail-all.tsv 系
// ---------------------------------------------------------------------------

/// `detail-all.tsv` 1 行に相当する補足情報 DTO。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardDetail {
    pub card_id: String,
    pub card_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supplement_info: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub supplement_date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pendulum_supplement_info: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pendulum_supplement_date: Option<String>,
}

// ---------------------------------------------------------------------------
// パターン抽出・置換系
// ---------------------------------------------------------------------------

/// 抽出されたカード名パターン（`extractCardPatterns` の要素）
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedPattern {
    pub pattern: String,
    pub r#type: PatternType,
    pub query: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start_index: Option<i64>,
    /// cardId パターンの場合、元のカード名を保持
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_name: Option<String>,
}

/// パターン検索結果（`extractAndSearchCards` の要素）
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardMatch {
    pub pattern: String,
    pub r#type: PatternType,
    pub query: String,
    pub results: Vec<Card>,
}

/// 置換状態。`'already_processed'` はアンダースコア区切り（lowercase ではない）。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReplacementStatus {
    Resolved,
    Multiple,
    NotFound,
    #[serde(rename = "already_processed")]
    AlreadyProcessed,
    Corrected,
}

/// 置換結果の個別要素
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ProcessedPattern {
    pub original: String,
    pub replaced: String,
    pub status: ReplacementStatus,
}

/// `judgeAndReplace` の戻り値
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplacementResult {
    pub processed_text: String,
    pub has_unprocessed: bool,
    pub warnings: Vec<String>,
    pub processed_patterns: Vec<ProcessedPattern>,
}
