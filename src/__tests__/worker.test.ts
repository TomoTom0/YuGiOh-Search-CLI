/**
 * Tests for search-parser functions in worker.ts
 */

import { describe, it, expect } from 'vitest'

// Copy interfaces and functions from worker.ts for testing
interface ParsedSearchQuery {
  positive: string[]
  negative: string[]
  phrases: string[]
  regexes: string[]
}

function parseSearchQuery(query: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    positive: [],
    negative: [],
    phrases: [],
    regexes: []
  }

  if (!query || !query.trim()) {
    return result
  }

  const matched: Array<{ start: number; end: number }> = []

  // 1. Extract regex patterns
  const regexPattern = /reg:(?:"([^"]+)"|(\S+))/g
  let match: RegExpExecArray | null
  while ((match = regexPattern.exec(query)) !== null) {
    const pattern = match[1] || match[2]
    result.regexes.push(pattern)
    matched.push({ start: match.index, end: match.index + match[0].length })
  }

  // 2. Extract negative search
  const negativePattern = /-(?:"([^"]+)"|(\S+))/g
  while ((match = negativePattern.exec(query)) !== null) {
    const word = match[1] || match[2]
    result.negative.push(word)
    matched.push({ start: match.index, end: match.index + match[0].length })
  }

  // 3. Extract phrase search
  const phrasePattern = /"([^"]+)"/g
  while ((match = phrasePattern.exec(query)) !== null) {
    const isOverlapping = matched.some(m =>
      (match!.index >= m.start && match!.index < m.end) ||
      (match!.index + match![0].length > m.start && match!.index + match![0].length <= m.end)
    )

    if (!isOverlapping) {
      const phrase = match[1]
      result.phrases.push(phrase)
      matched.push({ start: match.index, end: match.index + match[0].length })
    }
  }

  // 4. Extract positive words
  let remaining = ''
  let lastEnd = 0

  matched.sort((a, b) => a.start - b.start)

  for (const m of matched) {
    remaining += query.substring(lastEnd, m.start) + ' '
    lastEnd = m.end
  }
  remaining += query.substring(lastEnd)

  const words = remaining.split(/\s+/).filter(w => w.trim() && w !== '-' && !w.startsWith('reg:'))
  result.positive = words

  return result
}

function matchParsedQuery(text: string, parsed: ParsedSearchQuery): boolean {
  if (!text) return false

  for (const negWord of parsed.negative) {
    if (text.includes(negWord)) {
      return false
    }
  }

  for (const regexStr of parsed.regexes) {
    try {
      const regex = new RegExp(regexStr)
      if (!regex.test(text)) {
        return false
      }
    } catch (e) {
      return false
    }
  }

  for (const phrase of parsed.phrases) {
    if (!text.includes(phrase)) {
      return false
    }
  }

  for (const word of parsed.positive) {
    if (!text.includes(word)) {
      return false
    }
  }

  return true
}

describe('parseSearchQuery', () => {
  it('should parse negative search', () => {
    const result = parseSearchQuery('青眼 -儀式 -"融合"')
    expect(result.positive).toEqual(['青眼'])
    expect(result.negative).toEqual(['儀式', '融合'])
    expect(result.phrases).toEqual([])
    expect(result.regexes).toEqual([])
  })

  it('should parse phrase search', () => {
    const result = parseSearchQuery('"ブラック・マジシャン" "青眼の白龍"')
    expect(result.positive).toEqual([])
    expect(result.negative).toEqual([])
    expect(result.phrases).toEqual(['ブラック・マジシャン', '青眼の白龍'])
    expect(result.regexes).toEqual([])
  })

  it('should parse regex search', () => {
    const result = parseSearchQuery('reg:青眼.* reg:"ブラック.*"')
    expect(result.positive).toEqual([])
    expect(result.negative).toEqual([])
    expect(result.phrases).toEqual([])
    expect(result.regexes).toEqual(['青眼.*', 'ブラック.*'])
  })

  it('should parse combined search', () => {
    const result = parseSearchQuery('ドラゴン -"儀式" "青眼の白龍" reg:.*マジシャン')
    expect(result.positive).toEqual(['ドラゴン'])
    expect(result.negative).toEqual(['儀式'])
    expect(result.phrases).toEqual(['青眼の白龍'])
    expect(result.regexes).toEqual(['.*マジシャン'])
  })

  it('should return empty result for empty query', () => {
    const result = parseSearchQuery('')
    expect(result.positive).toEqual([])
    expect(result.negative).toEqual([])
    expect(result.phrases).toEqual([])
    expect(result.regexes).toEqual([])
  })

  it('should handle simple word', () => {
    const result = parseSearchQuery('青眼')
    expect(result.positive).toEqual(['青眼'])
    expect(result.negative).toEqual([])
    expect(result.phrases).toEqual([])
    expect(result.regexes).toEqual([])
  })

  it('should handle multiple positive words', () => {
    const result = parseSearchQuery('青眼 ドラゴン 白龍')
    expect(result.positive).toEqual(['青眼', 'ドラゴン', '白龍'])
    expect(result.negative).toEqual([])
  })
})

describe('matchParsedQuery', () => {
  it('should match with positive words', () => {
    const parsed = parseSearchQuery('青眼 ドラゴン')
    const text = 'この青眼の白龍はドラゴン族です'
    expect(matchParsedQuery(text, parsed)).toBe(true)
  })

  it('should not match when positive word is missing', () => {
    const parsed = parseSearchQuery('青眼 ドラゴン')
    const text = 'この青眼の白龍です'
    expect(matchParsedQuery(text, parsed)).toBe(false)
  })

  it('should exclude with negative word', () => {
    const parsed = parseSearchQuery('青眼 -融合')
    const text = 'この青眼の融合モンスターです'
    expect(matchParsedQuery(text, parsed)).toBe(false)
  })

  it('should match with phrase', () => {
    const parsed = parseSearchQuery('"青眼の白龍"')
    const text = 'この青眼の白龍は強力です'
    expect(matchParsedQuery(text, parsed)).toBe(true)
  })

  it('should not match when phrase is broken', () => {
    const parsed = parseSearchQuery('"青眼の白龍"')
    const text = 'この青眼は強力です'
    expect(matchParsedQuery(text, parsed)).toBe(false)
  })

  it('should match with regex', () => {
    const parsed = parseSearchQuery('reg:青眼.*龍')
    const text = '青眼の白龍です'
    expect(matchParsedQuery(text, parsed)).toBe(true)
  })

  it('should not match when regex fails', () => {
    const parsed = parseSearchQuery('reg:青眼.*龍')
    const text = '青眼モンスターです'
    expect(matchParsedQuery(text, parsed)).toBe(false)
  })

  it('should handle invalid regex gracefully', () => {
    const parsed = parseSearchQuery('reg:[invalid')
    const text = 'any text'
    expect(matchParsedQuery(text, parsed)).toBe(false)
  })

  it('should match combined conditions', () => {
    const parsed = parseSearchQuery('ドラゴン "青眼" -融合')
    const text = 'ドラゴン族の青眼モンスター'
    expect(matchParsedQuery(text, parsed)).toBe(true)
  })

  it('should not match when one condition fails', () => {
    const parsed = parseSearchQuery('ドラゴン "青眼" -融合')
    const text = 'ドラゴン族の青眼融合モンスター'
    expect(matchParsedQuery(text, parsed)).toBe(false)
  })
})

describe('sort parameter validation', () => {
  it('should parse sort field and order correctly', () => {
    const sort1 = 'atk:desc'
    const parts1 = sort1.split(':')
    expect(parts1[0]).toBe('atk')
    expect(parts1[1]?.toUpperCase()).toBe('DESC')

    const sort2 = 'name:asc'
    const parts2 = sort2.split(':')
    expect(parts2[0]).toBe('name')
    expect(parts2[1]?.toUpperCase()).toBe('ASC')

    const sort3 = 'level'
    const parts3 = sort3.split(':')
    expect(parts3[0]).toBe('level')
    expect(parts3[1]).toBeUndefined()
  })

  it('should validate sort fields', () => {
    const validSortFields = ['card_id', 'name', 'ruby', 'atk', 'def', 'level', 'attribute', 'race', 'card_type']

    expect(validSortFields.includes('atk')).toBe(true)
    expect(validSortFields.includes('name')).toBe(true)
    expect(validSortFields.includes('invalid_field')).toBe(false)
  })
})
