/**
 * Worker API Endpoints Tests
 *
 * Note: These are unit tests for request validation and response formatting.
 * For full integration tests with D1/Vectorize/R2, run E2E tests separately.
 */

import { describe, it, expect } from 'vitest'

describe('API Endpoint Request Validation', () => {
  describe('parseFilterParams', () => {
    it('should parse simple filter format', () => {
      const params = new URLSearchParams('filter[name]=青眼の白龍')
      const result = parseFilterParams(params)

      expect(result).toHaveProperty('name')
      expect(result.name).toEqual({ op: 'and', cond: ['青眼の白龍'] })
    })

    it('should parse OR condition', () => {
      const params = new URLSearchParams()
      params.append('filter[attribute][or][]', 'light')
      params.append('filter[attribute][or][]', 'dark')

      const result = parseFilterParams(params)

      expect(result).toHaveProperty('attribute')
      expect(result.attribute.op).toBe('or')
      expect(result.attribute.cond).toEqual(['light', 'dark'])
    })

    it('should parse AND condition', () => {
      const params = new URLSearchParams()
      params.append('filter[level][and][]', '8')
      params.append('filter[level][and][]', '9')

      const result = parseFilterParams(params)

      expect(result).toHaveProperty('level')
      expect(result.level.op).toBe('and')
      expect(result.level.cond).toEqual(['8', '9'])
    })
  })

  describe('validateSearchParams', () => {
    it('should validate limit within range', () => {
      const errors = validateSearchParams(10, 0, 'exact')
      expect(errors).toHaveLength(0)
    })

    it('should reject limit > MAX_LIMIT', () => {
      const errors = validateSearchParams(200, 0, 'exact')
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toContain('limit')
    })

    it('should reject negative offset', () => {
      const errors = validateSearchParams(10, -1, 'exact')
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toContain('offset')
    })

    it('should reject invalid mode', () => {
      const errors = validateSearchParams(10, 0, 'invalid')
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toContain('mode')
    })
  })

  describe('normalizeForSearch', () => {
    it('should normalize whitespace', () => {
      const result = normalizeForSearch('青眼 の 白龍')
      expect(result).toBe('青眼ノ白龍')
    })

    it('should normalize symbols', () => {
      const result = normalizeForSearch('E・HERO')
      expect(result).toBe('ehero')
    })

    it('should convert 竜 to 龍', () => {
      const result = normalizeForSearch('青眼の白竜')
      expect(result).toBe('青眼ノ白龍')
    })

    it('should convert full-width to half-width', () => {
      const result = normalizeForSearch('ＡＢＣ１２３')
      expect(result).toBe('abc123')
    })

    it('should convert hiragana to katakana', () => {
      const result = normalizeForSearch('あいうえお')
      expect(result).toBe('アイウエオ')
    })
  })
})

describe('Format Conversion Functions', () => {
  describe('parseTSV', () => {
    it('should parse TSV with headers', () => {
      const content = 'id\tname\ttype\n1\t青眼の白龍\tmonster\n2\tブラック・マジシャン\tmonster'
      const result = parseTSV(content)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({ id: '1', name: '青眼の白龍', type: 'monster' })
      expect(result[1]).toEqual({ id: '2', name: 'ブラック・マジシャン', type: 'monster' })
    })

    it('should handle empty values', () => {
      const content = 'id\tname\ttype\n1\t\tmonster'
      const result = parseTSV(content)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({ id: '1', name: '', type: 'monster' })
    })

    it('should handle empty input', () => {
      const content = ''
      const result = parseTSV(content)

      expect(result).toHaveLength(0)
    })
  })
})

// Helper functions copied from worker.ts for testing
interface NormalizedFilter {
  op: 'and' | 'or'
  cond: any[]
}

function parseFilterParams(searchParams: URLSearchParams): Record<string, NormalizedFilter> {
  const filter: Record<string, NormalizedFilter> = {}
  const processed = new Set<string>()

  for (const [key, value] of searchParams.entries()) {
    const simpleMatch = key.match(/^filter\[([^\]]+)\]$/)
    const complexMatch = key.match(/^filter\[([^\]]+)\]\[([^\]]+)\](?:\[\])?$/)

    if (simpleMatch) {
      const field = simpleMatch[1]
      if (!processed.has(field)) {
        filter[field] = { op: 'and', cond: [value] }
        processed.add(field)
      }
    } else if (complexMatch) {
      const field = complexMatch[1]
      const opOrKey = complexMatch[2]

      if (opOrKey === 'or' || opOrKey === 'and') {
        const op = opOrKey
        if (!filter[field]) {
          filter[field] = { op, cond: [] }
          processed.add(field)
        }
        filter[field].cond.push(value)
      } else if (opOrKey === 'cond') {
        if (!filter[field]) {
          filter[field] = { op: 'and', cond: [] }
          processed.add(field)
        }
        filter[field].cond.push(value)
      }
    }
  }

  return filter
}

function validateSearchParams(limit: number, offset: number, mode: string): string[] {
  const errors: string[] = []
  const MAX_LIMIT = 100
  const MAX_OFFSET = 1000

  if (limit > MAX_LIMIT || limit < 1) {
    errors.push(`limit must be between 1 and ${MAX_LIMIT}`)
  }

  if (offset > MAX_OFFSET || offset < 0) {
    errors.push(`offset must be between 0 and ${MAX_OFFSET}`)
  }

  if (mode !== 'exact' && mode !== 'partial') {
    errors.push('mode must be "exact" or "partial"')
  }

  return errors
}

function normalizeForSearch(str: string): string {
  if (!str) return ''
  return str
    .replace(/[\s\u3000]+/g, '')
    .replace(/[・★☆※‼！？。、,.，．:：;；「」『』【】〔〕（）()［］\[\]｛｝{}〈〉《》〜～~\-－_＿\/／\\＼|｜&＆@＠#＃$＄%％^＾*＊+＋=＝<＜>＞'"\"'""''`´｀]/g, '')
    .replace(/竜/g, '龍')
    .replace(/剣/g, '劍')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (s) => String.fromCharCode(s.charCodeAt(0) + 0x60))
}

function parseTSV(content: string): Array<Record<string, string>> {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length === 0) return []

  const headers = lines[0].split('\t')
  const data: Array<Record<string, string>> = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t')
    const row: Record<string, string> = {}

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || ''
    }

    data.push(row)
  }

  return data
}
