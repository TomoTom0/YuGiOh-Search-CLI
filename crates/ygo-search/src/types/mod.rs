//! TS 公開 API の型契約（M0-T2）。
//!
//! `src/types/card.ts`・`src/types/faq.ts` および各 lib の Options 型を serde DTO として再現。
//! M1-T1/T2 で実ロジックへ統合するまでの、凍結された型契約。

pub mod card;
pub mod faq;
pub mod options;
pub mod vector;

pub use card::{
    Attribute, Card, CardDetail, CardMatch, CardType, ExtractedPattern, LevelType, LinkMarker,
    MonsterType, PatternType, ProcessedPattern, Race, ReplacementResult, ReplacementStatus,
    SpellEffectType, TrapEffectType,
};
pub use faq::{CardReference, FAQIndex, FAQIndexEntry, FAQRecord, FAQSearchResult, FAQWithCards};
pub use options::{
    CardSearchParams, ExtractOptions, Format, GenericConversionOptions, JudgeAndReplaceOptions,
    SearchFAQParams, SearchMode, SeekCardsOptions,
};
pub use vector::{
    DistanceType, ExcludeOptions, FilterValue, QueryInput, SearchResult, VectorRecord,
    VectorSearchAllResult, VectorSearchOptions,
};
