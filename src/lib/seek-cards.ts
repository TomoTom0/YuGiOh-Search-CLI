/**
 * カードのランダム取得・範囲指定取得機能
 * @packageDocumentation
 */

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { getTsvPath } from './config/paths.js'

export interface SeekCardsOptions {
  /**
   * 最大取得件数
   * @default 10
   */
  max?: number

  /**
   * ランダムに選択するかどうか
   * @default true
   */
  random?: boolean

  /**
   * cardIdの範囲指定 [start, end]
   * @example [4000, 5000]
   */
  range?: [number, number]

  /**
   * 範囲内の全カードを取得（maxを無視）
   * rangeと併用する必要がある
   * @default false
   */
  all?: boolean

  /**
   * 取得するカラム
   * @default ['cardId', 'name']
   */
  cols?: string[]

  /**
   * 全カラムを取得
   * @default false
   */
  colAll?: boolean
}

/**
 * ランダムまたは範囲指定でカードを取得する
 *
 * @param options - 取得オプション
 * @returns カード情報の配列
 *
 * @example
 * ```typescript
 * import { seekCards } from 'ygo-search'
 *
 * // ランダムに10件取得
 * const cards = await seekCards()
 *
 * // 範囲指定で20件取得
 * const rangeCards = await seekCards({
 *   range: [4000, 5000],
 *   max: 20
 * })
 *
 * // 範囲内の全カードを取得
 * const allCards = await seekCards({
 *   range: [4000, 5000],
 *   all: true
 * })
 *
 * // 特定のカラムのみ取得
 * const detailCards = await seekCards({
 *   max: 5,
 *   cols: ['cardId', 'name', 'atk', 'def']
 * })
 * ```
 */
export async function seekCards(options: SeekCardsOptions = {}): Promise<Record<string, string>[]> {
  const {
    max = 10,
    random = true,
    range,
    all = false,
    cols = ['cardId', 'name'],
    colAll = false
  } = options

  // Validate options
  if (all && !range) {
    throw new Error('--all requires --range')
  }

  // Get TSV file paths
  const cardsFile = getTsvPath('cards-all.tsv')
  const detailFile = getTsvPath('detail-all.tsv')

  if (!fs.existsSync(cardsFile)) {
    throw new Error(`Data file not found: ${cardsFile}`)
  }

  // Read cards-all.tsv
  const rlCards = readline.createInterface({
    input: fs.createReadStream(cardsFile),
    crlfDelay: Infinity
  })

  let cardsHeaders: string[] = []
  const allCards: Record<string, string>[] = []

  for await (const line of rlCards) {
    if (!line) continue

    if (cardsHeaders.length === 0) {
      cardsHeaders = line.split('\t')
      continue
    }

    const values = line.split('\t')
    const card: Record<string, string> = {}

    for (let i = 0; i < cardsHeaders.length; i++) {
      const value = values[i] || ''
      card[cardsHeaders[i]] = value.replace(/\\n/g, '\n')
    }

    // Filter by range if specified
    if (range) {
      const cardId = parseInt(card.cardId)
      if (isNaN(cardId) || cardId < range[0] || cardId > range[1]) {
        continue
      }
    }

    allCards.push(card)
  }

  // Read detail-all.tsv and merge by cardId
  let effectiveCols = colAll ? [] : [...cols]

  if (fs.existsSync(detailFile)) {
    const rlDetail = readline.createInterface({
      input: fs.createReadStream(detailFile),
      crlfDelay: Infinity
    })

    let detailHeaders: string[] = []
    const detailMap = new Map<string, Record<string, string>>()

    for await (const line of rlDetail) {
      if (!line) continue

      if (detailHeaders.length === 0) {
        detailHeaders = line.split('\t')
        continue
      }

      const values = line.split('\t')
      const detail: Record<string, string> = {}
      let cardId = ''

      for (let i = 0; i < detailHeaders.length; i++) {
        const header = detailHeaders[i]
        const value = values[i] || ''
        detail[header] = value.replace(/\\n/g, '\n')
        if (header === 'cardId') {
          cardId = values[i]
        }
      }

      if (cardId) {
        detailMap.set(cardId, detail)
      }
    }

    // Merge detail info into cards (skip duplicate columns)
    for (const card of allCards) {
      const detail = detailMap.get(card.cardId)
      if (detail) {
        for (const [key, value] of Object.entries(detail)) {
          // Skip if column already exists in card (avoid duplicates)
          if (!card.hasOwnProperty(key)) {
            card[key] = value
          }
        }
      }
    }

    // Update available columns for --col-all
    if (colAll) {
      // Get all unique column names from merged data
      const allColumnNames = new Set<string>()
      cardsHeaders.forEach(h => allColumnNames.add(h))
      detailHeaders.forEach(h => allColumnNames.add(h))
      effectiveCols = Array.from(allColumnNames)
    }
  } else {
    // If detail file doesn't exist, just use cards headers
    if (colAll) {
      effectiveCols = cardsHeaders
    }
  }

  // Select cards
  let selectedCards: Record<string, string>[]

  if (all) {
    selectedCards = allCards
  } else if (random) {
    // Random selection
    const count = Math.min(max, allCards.length)
    selectedCards = []
    const indices = new Set<number>()

    while (indices.size < count) {
      indices.add(Math.floor(Math.random() * allCards.length))
    }

    for (const idx of indices) {
      selectedCards.push(allCards[idx])
    }
  } else {
    // Take first N cards
    selectedCards = allCards.slice(0, max)
  }

  // Filter columns
  const result = selectedCards.map(card => {
    const filtered: Record<string, string> = {}
    for (const col of effectiveCols) {
      filtered[col] = card[col] || ''
    }
    return filtered
  })

  return result
}
