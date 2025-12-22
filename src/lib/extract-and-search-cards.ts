/**
 * カードパターンの抽出と検索機能
 * @packageDocumentation
 */

import { spawn } from 'child_process'
import path from 'path'
import url from 'url'
import type { Card, CardMatch, PatternType } from '../types/card.js'
import { extractCardPatterns } from '../utils/pattern-extractor.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const bulkSearchScript = path.join(__dirname, '..', 'bulk-search-cards.js')

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

  // Build queries for bulk search
  const queries = patterns.map(p => {
    const filter: Record<string, string> = {}
    if (p.type === 'cardId') {
      filter.cardId = p.query
    } else {
      filter.name = p.query
    }

    const query: any = {
      filter,
      cols,
    }

    if (p.type === 'flexible') {
      query.flagAllowWild = true
      query.flagAutoModify = true
    } else if (p.type === 'exact') {
      query.flagAllowWild = false
      query.flagAutoModify = true
    }

    return query
  })

  return new Promise((resolve) => {
    const child = spawn('node', [bulkSearchScript, JSON.stringify(queries)], {
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code !== 0) {
        resolve(patterns.map(p => ({
          pattern: p.pattern,
          type: p.type,
          query: p.query,
          results: []
        })))
        return
      }

      try {
        const lines = stdout.trim().split('\n')
        const results: Card[][] = lines.map(line => JSON.parse(line))
        resolve(patterns.map((p, i) => ({
          pattern: p.pattern,
          type: p.type,
          query: p.query,
          results: results[i] || []
        })))
      } catch (e) {
        resolve(patterns.map(p => ({
          pattern: p.pattern,
          type: p.type,
          query: p.query,
          results: []
        })))
      }
    })

    child.on('error', () => {
      resolve(patterns.map(p => ({
        pattern: p.pattern,
        type: p.type,
        query: p.query,
        results: []
      })))
    })
  })
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
