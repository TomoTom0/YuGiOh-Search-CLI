/**
 * カードパターンの抽出と検索機能
 * @packageDocumentation
 */

import type { Card, CardMatch, PatternType } from '../types/card.js'
import { extractCardPatterns } from '../utils/pattern-extractor.js'
import { searchCards } from './card-search-core.js'

/**
 * 複数のパターンを一括検索する内部関数
 */
async function bulkSearchCards(patterns: Array<{pattern: string, type: PatternType, query: string}>): Promise<CardMatch[]> {
  const cols = [
    'cardType', 'name', 'ruby', 'cardId', 'ciid', 'imgs',
    'text', 'attribute', 'levelType', 'levelValue', 'race', 'monsterTypes',
    'atk', 'def', 'linkMarkers', 'pendulumScale', 'pendulumText',
    'isExtraDeck', 'spellEffectType', 'trapEffectType',
    'supplementInfo', 'supplementDate', 'pendulumSupplementInfo', 'pendulumSupplementDate'
  ]

  // Execute searches in parallel using Promise.all
  const searchPromises = patterns.map(async (p) => {
    const filter: Record<string, string> = {}
    if (p.type === 'cardId') {
      filter.cardId = p.query
    } else {
      filter.name = p.query
    }

    const searchParams: any = {
      filter,
      cols,
    }

    if (p.type === 'flexible') {
      searchParams.flagAllowWild = true
      searchParams.flagAutoModify = true
    } else if (p.type === 'exact') {
      searchParams.flagAllowWild = false
      searchParams.flagAutoModify = true
    }

    try {
      const results = await searchCards(searchParams)
      return {
        pattern: p.pattern,
        type: p.type,
        query: p.query,
        results: results as Card[]
      }
    } catch (e) {
      return {
        pattern: p.pattern,
        type: p.type,
        query: p.query,
        results: []
      }
    }
  })

  return Promise.all(searchPromises)
}

/**
 * テキスト中のカードパターンを抽出し、各パターンに対応するカード情報を検索する
 *
 * @param text - 処理対象のテキスト
 * @returns カードマッチの配列
 *
 * @example
 * ```typescript
 * import { extractAndSearchCards } from 'ygo-search'
 *
 * const cards = await extractAndSearchCards('I use {ブルーアイズ*} and 《青眼の白龍》 cards')
 * console.log(cards)
 * // [
 * //   {
 * //     pattern: '{ブルーアイズ*}',
 * //     type: 'flexible',
 * //     query: 'ブルーアイズ*',
 * //     results: [{ name: '青眼の白龍', cardId: 89631139, ... }]
 * //   },
 * //   {
 * //     pattern: '《青眼の白龍》',
 * //     type: 'exact',
 * //     query: '青眼の白龍',
 * //     results: [{ name: '青眼の白龍', cardId: 89631139, ... }]
 * //   }
 * // ]
 * ```
 */
export async function extractAndSearchCards(text: string): Promise<CardMatch[]> {
  // Extract patterns
  const patterns = extractCardPatterns(text)

  if (patterns.length === 0) {
    return []
  }

  // Search all patterns using bulk search
  const cards = await bulkSearchCards(patterns)

  return cards
}
