/**
 * カードパターンの判定と置換機能
 * @packageDocumentation
 */

import type { Card, PatternType, ReplacementResult, ReplacementStatus } from '../types/card.js'
import { extractCardPatterns } from '../utils/pattern-extractor.js'
import { searchCards } from './card-search-core.js'

interface CardMatchWithIndex {
  pattern: string
  type: PatternType
  query: string
  results: Card[]
  startIndex: number
  originalName?: string  // cardIdパターンの場合、元のカード名
}

export interface JudgeAndReplaceOptions {
  /**
   * 《official card name》形式で置換するかどうか
   * falseの場合は{{name|cardId}}形式で置換
   * @default false
   */
  mountPar?: boolean
}

/**
 * 複数のパターンを一括検索する内部関数
 */
async function bulkSearchCards(patterns: Array<{type: PatternType, query: string}>): Promise<Card[][]> {
  const cols = [
    'cardType', 'name', 'ruby', 'cardId', 'ciid', 'imgs',
    'text', 'attribute', 'levelType', 'levelValue', 'race', 'monsterTypes',
    'atk', 'def', 'linkMarkers', 'pendulumScale', 'pendulumText',
    'isExtraDeck', 'spellEffectType', 'trapEffectType',
    'supplementInfo', 'supplementDate', 'pendulumSupplementInfo', 'pendulumSupplementDate'
  ]

  // Execute searches in parallel using Promise.all
  const searchPromises = patterns.map(async (pattern) => {
    const filter: Record<string, string> = {}

    if (pattern.type === 'cardId') {
      filter.cardId = pattern.query
    } else {
      filter.name = pattern.query
    }

    const searchParams: any = {
      filter,
      cols,
    }

    if (pattern.type === 'flexible') {
      searchParams.flagAllowWild = true
      searchParams.flagAutoModify = true
    } else if (pattern.type === 'exact') {
      searchParams.flagAllowWild = false
      searchParams.flagAutoModify = true
    }

    try {
      const results = await searchCards(searchParams)
      return results as Card[]
    } catch (e) {
      return []
    }
  })

  return Promise.all(searchPromises)
}

/**
 * テキスト中のカードパターンを判定し、正規化された形式に置換する
 *
 * @param text - 処理対象のテキスト
 * @param options - オプション
 * @returns 置換結果
 *
 * @example
 * ```typescript
 * import { judgeAndReplace } from 'ygo-search'
 *
 * const result = await judgeAndReplace('I use {ブルーアイズ*} and 《青眼の白龍》 cards')
 * console.log(result.processedText)
 * // "I use {{青眼の白龍|89631139}} and {{青眼の白龍|89631139}} cards"
 *
 * // 《カード名》形式で置換
 * const result2 = await judgeAndReplace('Use {ブルーアイズ*}', { mountPar: true })
 * console.log(result2.processedText)
 * // "Use 《青眼の白龍》"
 * ```
 */
export async function judgeAndReplace(text: string, options: JudgeAndReplaceOptions = {}): Promise<ReplacementResult> {
  const { mountPar = false } = options
  const patterns = extractCardPatterns(text, { includeStartIndex: true })

  if (patterns.length === 0) {
    return {
      processedText: text,
      hasUnprocessed: false,
      warnings: [],
      processedPatterns: []
    }
  }

  // Deduplicate patterns before search for efficiency
  const uniquePatternMap = new Map<string, typeof patterns[0]>()
  for (const pattern of patterns) {
    const key = `${pattern.type}::${pattern.query}`
    if (!uniquePatternMap.has(key)) {
      uniquePatternMap.set(key, pattern)
    }
  }
  const uniquePatterns = Array.from(uniquePatternMap.values())

  // Bulk search unique patterns only
  const searchResults = await bulkSearchCards(uniquePatterns)

  // Create lookup map for search results
  const resultMap = new Map<string, Card[]>()
  for (let i = 0; i < uniquePatterns.length; i++) {
    const pattern = uniquePatterns[i]
    const key = `${pattern.type}::${pattern.query}`
    resultMap.set(key, searchResults[i])
  }

  // Build result
  const result: ReplacementResult = {
    processedText: text,
    hasUnprocessed: false,
    warnings: [],
    processedPatterns: []
  }

  // Process replacements in reverse order to maintain indices
  const patternsWithResults: CardMatchWithIndex[] = patterns.map((p) => {
    const key = `${p.type}::${p.query}`
    return {
      pattern: p.pattern,
      type: p.type,
      query: p.query,
      results: resultMap.get(key) || [],
      startIndex: p.startIndex!,
      originalName: p.originalName
    }
  })

  const sortedResults = patternsWithResults.sort((a, b) => b.startIndex - a.startIndex)

  // Track processed patterns to avoid duplicates
  const processedPatternKeys = new Set<string>()

  for (const match of sortedResults) {
    if (match.type === 'cardId') {
      // cardIdパターン: カードidで検索してカード名を検証・置き換え
      const resultCount = match.results.length
      let replacement = match.pattern
      let status: ReplacementStatus = 'already_processed'
      let warning: string | undefined

      if (resultCount === 1) {
        const card = match.results[0]
        const actualName = card.name
        const providedName = match.originalName || ''

        if (actualName !== providedName) {
          status = 'corrected'
          replacement = mountPar ? `《${actualName}》` : `{{${actualName}|${card.cardId}}}`
          warning = `⚠️ カード名を修正: "${providedName}" → "${actualName}" (cardId: ${card.cardId})`

          result.processedText = result.processedText.substring(0, match.startIndex) +
                                replacement +
                                result.processedText.substring(match.startIndex + match.pattern.length)
        }
      } else if (resultCount === 0) {
        warning = `⚠️ cardId "${match.query}" が見つかりません`
      } else {
        // 複数結果（通常はcardIdでは起きないがデータの問題を示唆）
        warning = `⚠️ cardId "${match.query}" で複数のカードが見つかりました。データを確認してください。`
      }

      const key = `${match.pattern}::${replacement}`
      if (!processedPatternKeys.has(key)) {
        processedPatternKeys.add(key)
        result.processedPatterns.push({
          original: match.pattern,
          replaced: replacement,
          status: status
        })
        if (warning) {
          result.warnings.push(warning)
        }
      }
      continue
    }

    const resultCount = match.results.length

    if (resultCount === 1) {
      // Exactly one result - replace with {{name|cardId}} or 《name》
      const card = match.results[0]
      const replacement = mountPar ? `《${card.name}》` : `{{${card.name}|${card.cardId}}}`
      result.processedText = result.processedText.substring(0, match.startIndex) +
                            replacement +
                            result.processedText.substring(match.startIndex + match.pattern.length)

      const key = `${match.pattern}::${replacement}`
      if (!processedPatternKeys.has(key)) {
        processedPatternKeys.add(key)
        result.processedPatterns.push({
          original: match.pattern,
          replaced: replacement,
          status: 'resolved'
        })
      }
    } else if (resultCount > 1) {
      // Multiple results - format as {{`original`_`name|id`_`name|id`_...}}
      const candidatesStr = match.results
        .map((card: Card) => `\`${card.name}|${card.cardId}\``)
        .join('_')
      const replacement = `{{\`${match.query}\`_${candidatesStr}}}`
      result.processedText = result.processedText.substring(0, match.startIndex) +
                            replacement +
                            result.processedText.substring(match.startIndex + match.pattern.length)

      const key = `${match.pattern}::${replacement}`
      if (!processedPatternKeys.has(key)) {
        processedPatternKeys.add(key)
        result.processedPatterns.push({
          original: match.pattern,
          replaced: replacement,
          status: 'multiple'
        })
      }
      result.hasUnprocessed = true
    } else {
      // No results - format as {{NOTFOUND_`original`}}
      const replacement = `{{NOTFOUND_\`${match.query}\`}}`
      result.processedText = result.processedText.substring(0, match.startIndex) +
                            replacement +
                            result.processedText.substring(match.startIndex + match.pattern.length)

      const key = `${match.pattern}::${replacement}`
      if (!processedPatternKeys.has(key)) {
        processedPatternKeys.add(key)
        result.processedPatterns.push({
          original: match.pattern,
          replaced: replacement,
          status: 'notfound'
        })
      }
      result.hasUnprocessed = true
    }
  }

  // Check for unprocessed markers
  if (result.hasUnprocessed) {
    result.warnings.push('⚠️ Text contains unprocessed patterns that require manual review')

    const notfoundCount = result.processedPatterns.filter(p => p.status === 'notfound').length
    const multipleCount = result.processedPatterns.filter(p => p.status === 'multiple').length

    if (notfoundCount > 0) {
      result.warnings.push(`Found ${notfoundCount} pattern(s) with no matches (NOTFOUND_*)`)
    }
    if (multipleCount > 0) {
      result.warnings.push(`Found ${multipleCount} pattern(s) with multiple matches - please select correct one`)
    }
  }

  return result
}
