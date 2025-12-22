/**
 * ygo-search - Yu-Gi-Oh! card search library
 * @packageDocumentation
 */

// ============================================================================
// Core search functions
// ============================================================================

/**
 * カード検索のコア機能
 * @example
 * ```ts
 * import { searchCards } from 'ygo-search'
 *
 * const results = await searchCards({
 *   filter: { name: '青眼の白龍' },
 *   cols: ['name', 'cardId', 'text']
 * })
 * ```
 */
export { searchCards } from './lib/card-search-core.js'
export type { CardSearchParams } from './lib/card-search-core.js'

/**
 * FAQ検索機能
 * @example
 * ```ts
 * import { searchFAQ } from 'ygo-search'
 *
 * const results = await searchFAQ({
 *   cardName: '青眼の白龍',
 *   limit: 10
 * })
 * ```
 */
export { searchFAQ } from './search-faq.js'
export type { SearchFAQParams } from './search-faq.js'

// ============================================================================
// FAQ utilities
// ============================================================================

/**
 * FAQテキストからカード参照を抽出するユーティリティ
 */
export {
  extractCardReferences,
  loadFAQIndex,
  getCardsByIds,
  clearCache
} from './utils/faq-loader.js'

// ============================================================================
// Card types
// ============================================================================

/**
 * カード関連の型定義
 */
export type {
  Card,
  CardDetail,
  CardMatch,
  ReplacementResult,
  CardType,
  Attribute,
  LevelType,
  Race,
  MonsterType,
  SpellEffectType,
  TrapEffectType,
  LinkMarker,
  PatternType,
  ExtractedPattern,
  ReplacementStatus
} from './types/card.js'

// ============================================================================
// FAQ types
// ============================================================================

/**
 * FAQ関連の型定義
 */
export type {
  FAQRecord,
  CardReference,
  FAQWithCards,
  FAQSearchResult,
  FAQIndex
} from './types/faq.js'

// ============================================================================
// Card pattern extraction and manipulation
// ============================================================================

/**
 * カードパターンの抽出機能
 * @example
 * ```ts
 * import { extractCardPatterns } from 'ygo-search'
 *
 * const patterns = extractCardPatterns('Use {ブルーアイズ*} and 《青眼の白龍》')
 * // [
 * //   { pattern: '{ブルーアイズ*}', type: 'flexible', query: 'ブルーアイズ*' },
 * //   { pattern: '《青眼の白龍》', type: 'exact', query: '青眼の白龍' }
 * // ]
 * ```
 */
export { extractCardPatterns } from './utils/pattern-extractor.js'
export type { ExtractOptions } from './utils/pattern-extractor.js'

/**
 * カードパターンを抽出して検索する機能
 * @example
 * ```ts
 * import { extractAndSearchCards } from 'ygo-search'
 *
 * const results = await extractAndSearchCards('Use {ブルーアイズ*}')
 * // [{ pattern: '{ブルーアイズ*}', type: 'flexible', query: 'ブルーアイズ*', results: [...] }]
 * ```
 */
export { extractAndSearchCards } from './lib/extract-and-search-cards.js'

/**
 * カードパターンを判定して置換する機能
 * @example
 * ```ts
 * import { judgeAndReplace } from 'ygo-search'
 *
 * const result = await judgeAndReplace('Use {ブルーアイズ*}')
 * // { processedText: 'Use {{青眼の白龍|89631139}}', ... }
 * ```
 */
export { judgeAndReplace } from './lib/judge-and-replace.js'
export type { JudgeAndReplaceOptions } from './lib/judge-and-replace.js'

// ============================================================================
// Card seek (random/range retrieval)
// ============================================================================

/**
 * カードのランダム取得・範囲指定取得機能
 * @example
 * ```ts
 * import { seekCards } from 'ygo-search'
 *
 * // ランダムに10件取得
 * const cards = await seekCards({ max: 10 })
 *
 * // 範囲指定で取得
 * const rangeCards = await seekCards({ range: [4000, 5000], max: 20 })
 * ```
 */
export { seekCards } from './lib/seek-cards.js'
export type { SeekCardsOptions } from './lib/seek-cards.js'

// ============================================================================
// Format conversion
// ============================================================================

/**
 * フォーマット変換機能
 * @example
 * ```ts
 * import { convertFormatFile, formatOutput, parseFormatString } from 'ygo-search'
 *
 * // ファイル変換
 * await convertFormatFile('input.json', 'output.yaml')
 *
 * // データ変換
 * const yamlString = formatOutput({ key: 'value' }, 'yaml')
 *
 * // パース
 * const data = parseFormatString('{"key":"value"}', 'json')
 * ```
 */
export {
  convertFormatFile,
  detectFormat,
  formatOutput,
  parseFormatString,
  parseFormatFile
} from './lib/format-converter.js'
export type { Format } from './lib/format-converter.js'

// ============================================================================
// Vector search
// ============================================================================

/**
 * Vector検索機能
 * @example
 * ```ts
 * import { vectorSearchCards, vectorSearchFaqs, vectorSearchAll, searchTable, listTables } from 'ygo-search'
 *
 * // カード検索
 * const cardResults = await vectorSearchCards('墓地から特殊召喚', { limit: 5 })
 *
 * // FAQ検索
 * const faqResults = await vectorSearchFaqs('チェーンブロック', { limit: 5 })
 *
 * // 全体検索（全テーブル）
 * const allResults = await vectorSearchAll('融合召喚', { limit: 10 })
 * // { cards: [...], faqs: [...], rules: [...], ... }
 *
 * // カスタムテーブル検索
 * const customResults = await searchTable('rules', 'ターン', { limit: 5 })
 *
 * // テーブル一覧取得
 * const tables = await listTables()
 * ```
 */
export {
  searchCards as vectorSearchCards,
  searchFaqs as vectorSearchFaqs,
  searchAll as vectorSearchAll,
  searchTable,
  listTables
} from './lib/vector/searcher.js'

export type {
  SearchResult as VectorSearchResult,
  VectorSearchOptions,
  CardSearchOptions as VectorCardSearchOptions,
  FaqSearchOptions as VectorFaqSearchOptions
} from './lib/vector/searcher.js'

// ============================================================================
// Vector DB setup and conversion
// ============================================================================

/**
 * Vector DBインデックス構築とデータ変換機能
 * @example
 * ```ts
 * import { convertCardsToJsonl, convertFaqsToJsonl, convertGenericToJsonl, indexFromJsonl } from 'ygo-search'
 *
 * // カードデータをJSONLに変換
 * const count = await convertCardsToJsonl('cards.tsv', 'detail.tsv', 'cards.jsonl')
 *
 * // FAQデータをJSONLに変換
 * const faqCount = await convertFaqsToJsonl('faqs.tsv', 'faqs.jsonl')
 *
 * // 汎用データをJSONLに変換
 * const genericCount = await convertGenericToJsonl('data.json', 'output.jsonl', {
 *   excludeColumns: ['cite', 'sourceFile']
 * })
 *
 * // Vector DBインデックスを構築
 * await indexFromJsonl('cards', 'cards.jsonl')
 * ```
 */
export {
  convertCardsToJsonl,
  convertFaqsToJsonl,
  convertGenericToJsonl
} from './lib/vector/converter.js'

export type {
  VectorRecord,
  GenericConversionOptions
} from './lib/vector/converter.js'

export { indexFromJsonl } from './lib/vector/indexer.js'

// ============================================================================
// Utilities
// ============================================================================

/**
 * プロジェクトルートを検出するユーティリティ
 */
export { findProjectRoot } from './utils/project-root.js'
