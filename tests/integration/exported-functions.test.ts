/**
 * 新しくexportされた関数のテスト
 */

import { describe, it, expect } from 'vitest'
import {
  extractCardPatterns,
  extractAndSearchCards,
  judgeAndReplace,
  seekCards,
  formatOutput,
  parseFormatString,
  detectFormat
} from '../../dist/index.js'

describe('extractCardPatterns', () => {
  it('柔軟パターンを抽出できる', () => {
    const text = 'Use {ブルーアイズ*} card'
    const patterns = extractCardPatterns(text)

    expect(patterns).toHaveLength(1)
    expect(patterns[0].type).toBe('flexible')
    expect(patterns[0].query).toBe('ブルーアイズ*')
    expect(patterns[0].pattern).toBe('{ブルーアイズ*}')
  })

  it('厳密パターンを抽出できる', () => {
    const text = 'Use 《青眼の白龍》 card'
    const patterns = extractCardPatterns(text)

    expect(patterns).toHaveLength(1)
    expect(patterns[0].type).toBe('exact')
    expect(patterns[0].query).toBe('青眼の白龍')
    expect(patterns[0].pattern).toBe('《青眼の白龍》')
  })

  it('cardIdパターンを抽出できる', () => {
    const text = 'Use {{青眼の白龍|89631139}} card'
    const patterns = extractCardPatterns(text)

    expect(patterns).toHaveLength(1)
    expect(patterns[0].type).toBe('cardId')
    expect(patterns[0].query).toBe('89631139')
    expect(patterns[0].pattern).toBe('{{青眼の白龍|89631139}}')
    expect(patterns[0].originalName).toBe('青眼の白龍')
  })

  it('複数パターンを抽出できる', () => {
    const text = 'Use {ブルーアイズ*} and 《青眼の白龍》 cards'
    const patterns = extractCardPatterns(text)

    expect(patterns).toHaveLength(2)
    // パターン抽出の順序はcardId→exact→flexibleなので、《》が先に来る
    expect(patterns[0].type).toBe('exact')
    expect(patterns[1].type).toBe('flexible')
  })

  it('パターンがない場合は空配列を返す', () => {
    const text = 'No patterns here'
    const patterns = extractCardPatterns(text)

    expect(patterns).toHaveLength(0)
  })

  it('startIndexオプションを使用できる', () => {
    const text = 'Use {ブルーアイズ*} card'
    const patterns = extractCardPatterns(text, { includeStartIndex: true })

    expect(patterns).toHaveLength(1)
    expect(patterns[0].startIndex).toBe(4)
  })
})

describe('extractAndSearchCards', () => {
  it('パターンを抽出して検索できる', async () => {
    const text = 'Use 《青眼の白龍》 card'
    const results = await extractAndSearchCards(text)

    expect(results).toHaveLength(1)
    expect(results[0].pattern).toBe('《青眼の白龍》')
    expect(results[0].type).toBe('exact')
    expect(results[0].query).toBe('青眼の白龍')
    expect(results[0].results).toHaveLength(1)
    expect(results[0].results[0].name).toBe('青眼の白龍')
  })

  it('パターンがない場合は空配列を返す', async () => {
    const text = 'No patterns here'
    const results = await extractAndSearchCards(text)

    expect(results).toHaveLength(0)
  })
})

describe('judgeAndReplace', () => {
  it('厳密パターンを置換できる', async () => {
    const text = 'Use 《青眼の白龍》 card'
    const result = await judgeAndReplace(text)

    // 厳密検索で1件のみヒットする場合は置換される
    expect(result.processedText).toContain('{{青眼の白龍|')
    expect(result.processedText).toContain('}}')
    expect(result.hasUnprocessed).toBe(false)
    expect(result.processedPatterns).toHaveLength(1)
    expect(result.processedPatterns[0].status).toBe('resolved')
  })

  it('柔軟検索で複数候補がある場合はmultipleステータスになる', async () => {
    const text = 'Use {青眼*} card'
    const result = await judgeAndReplace(text)

    // 複数候補がある場合は候補リストが返される
    expect(result.hasUnprocessed).toBe(true)
    expect(result.processedPatterns[0].status).toBe('multiple')
    expect(result.processedText).toContain('{{`青眼*`_')
  })

  it('mountParオプションで《》形式に置換できる（1件のみヒット）', async () => {
    const text = 'Use 《青眼の白龍》 card'
    const result = await judgeAndReplace(text, { mountPar: true })

    // 厳密検索で1件のみヒットする場合は《》形式で置換
    expect(result.processedText).toContain('《青眼の白龍》')
    expect(result.processedPatterns[0].status).toBe('resolved')
  })

  it('パターンがない場合はそのまま返す', async () => {
    const text = 'No patterns here'
    const result = await judgeAndReplace(text)

    expect(result.processedText).toBe(text)
    expect(result.hasUnprocessed).toBe(false)
    expect(result.processedPatterns).toHaveLength(0)
  })
})

describe('seekCards', () => {
  it('デフォルトで10件のカードを取得できる', async () => {
    const cards = await seekCards()

    expect(cards.length).toBeLessThanOrEqual(10)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveProperty('cardId')
    expect(cards[0]).toHaveProperty('name')
  })

  it('max指定で件数を制限できる', async () => {
    const cards = await seekCards({ max: 5 })

    expect(cards.length).toBeLessThanOrEqual(5)
    expect(cards.length).toBeGreaterThan(0)
  })

  it('range指定で範囲を絞れる', async () => {
    const cards = await seekCards({ range: [4000, 4100], max: 20 })

    for (const card of cards) {
      const cardId = parseInt(card.cardId)
      expect(cardId).toBeGreaterThanOrEqual(4000)
      expect(cardId).toBeLessThanOrEqual(4100)
    }
  })

  it('cols指定で取得カラムを指定できる', async () => {
    const cards = await seekCards({ max: 5, cols: ['cardId', 'name', 'text'] })

    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveProperty('cardId')
    expect(cards[0]).toHaveProperty('name')
    expect(cards[0]).toHaveProperty('text')
  })
})

describe('format conversion functions', () => {
  it('detectFormatで拡張子からフォーマットを検出できる', () => {
    expect(detectFormat('file.json')).toBe('json')
    expect(detectFormat('file.jsonl')).toBe('jsonl')
    expect(detectFormat('file.jsonc')).toBe('jsonc')
    expect(detectFormat('file.yaml')).toBe('yaml')
    expect(detectFormat('file.yml')).toBe('yaml')
  })

  it('parseFormatStringでJSON文字列をパースできる', () => {
    const input = '{"key": "value"}'
    const result = parseFormatString(input, 'json')

    expect(result).toEqual({ key: 'value' })
  })

  it('parseFormatStringでJSONL文字列をパースできる', () => {
    const input = '{"a": 1}\n{"b": 2}'
    const result = parseFormatString(input, 'jsonl')

    expect(result).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('parseFormatStringでYAML文字列をパースできる', () => {
    const input = 'key: value'
    const result = parseFormatString(input, 'yaml')

    expect(result).toEqual({ key: 'value' })
  })

  it('formatOutputでJSONフォーマットに変換できる', () => {
    const data = { key: 'value' }
    const result = formatOutput(data, 'json')

    expect(result).toContain('"key"')
    expect(result).toContain('"value"')
  })

  it('formatOutputでJSONLフォーマットに変換できる', () => {
    const data = [{ a: 1 }, { b: 2 }]
    const result = formatOutput(data, 'jsonl')

    expect(result).toBe('{"a":1}\n{"b":2}')
  })

  it('formatOutputでYAMLフォーマットに変換できる', () => {
    const data = { key: 'value' }
    const result = formatOutput(data, 'yaml')

    expect(result).toContain('key: value')
  })

  it('formatOutputでJSONCフォーマットに変換できる', () => {
    const data = { key: 'value' }
    const result = formatOutput(data, 'jsonc')

    expect(result).toContain('// Generated at')
    expect(result).toContain('"key"')
    expect(result).toContain('"value"')
  })
})
