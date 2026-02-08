/**
 * Tests for search-parser functions
 */

import { describe, it, expect } from 'vitest'
import { parseSearchQuery, matchParsedQuery } from '../lib/shared/search-parser.js'
import type { ParsedSearchQuery } from '../lib/shared/search-parser.js'

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
