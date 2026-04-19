import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchCardPattern, extractCardPatterns } from '../../src/lib/worker/patterns.js'
import type { Env } from '../../src/worker.js'

const mockPrepare = vi.fn()
const mockBind = vi.fn()
const mockAll = vi.fn()

function createMockEnv(): Env {
  return {
    DB: { prepare: mockPrepare } as unknown as Env['DB'],
    ANALYTICS: undefined,
    VECTORIZER: undefined,
    R2_BUCKET: undefined,
    AI: undefined,
    AZURE_API_KEY: undefined,
    AZURE_MODEL: undefined,
    AZURE_ENDPOINT: undefined,
    API_SECRET: undefined
  }
}

const mockEnv = createMockEnv()

beforeEach(() => {
  vi.clearAllMocks()
  mockAll.mockResolvedValue({ results: [] })
  mockBind.mockReturnValue({ all: mockAll })
  mockPrepare.mockReturnValue({ bind: mockBind })
})

describe('extractCardPatterns', () => {
  it('should extract flexible pattern {name}', () => {
    const patterns = extractCardPatterns('{青眼の白龍}を召喚')
    expect(patterns).toHaveLength(1)
    expect(patterns[0].type).toBe('flexible')
    expect(patterns[0].query).toBe('青眼の白龍')
  })

  it('should extract exact pattern 《name》', () => {
    const patterns = extractCardPatterns('《青眼の白龍》を召喚')
    expect(patterns).toHaveLength(1)
    expect(patterns[0].type).toBe('exact')
    expect(patterns[0].query).toBe('青眼の白龍')
  })

  it('should extract cardId pattern {{name|id}}', () => {
    const patterns = extractCardPatterns('{{青眼の白龍|4007}}を召喚')
    expect(patterns).toHaveLength(1)
    expect(patterns[0].type).toBe('cardId')
    expect(patterns[0].query).toBe('4007')
  })

  it('should extract multiple patterns from one text', () => {
    const patterns = extractCardPatterns('{青眼の白龍}と《ブラック・マジシャン》を召喚')
    expect(patterns).toHaveLength(2)
  })

  it('should extract wildcard pattern', () => {
    const patterns = extractCardPatterns('{青眼*}を召喚')
    expect(patterns).toHaveLength(1)
    expect(patterns[0].query).toBe('青眼*')
  })
})

describe('searchCardPattern', () => {
  it('should use LIKE with % for wildcard flexible pattern (regression: wildcard normalization)', async () => {
    // normalizeForSearch('青眼*') returns '青眼' (strips *), so the fix splits by * first
    // then normalizes each part: ['青眼', ''] → ['青眼', ''] → joined with % → '青眼%'
    const pattern = { pattern: '{青眼*}', type: 'flexible' as const, query: '青眼*' }
    await searchCardPattern(pattern, mockEnv)

    const sql = mockPrepare.mock.calls[0][0]
    expect(sql).toContain('LIKE ?')

    const bindArg = mockBind.mock.calls[0][0]
    expect(bindArg).toContain('%')
    expect(bindArg).not.toBe('青眼') // would be without the fix
  })

  it('should use = for exact flexible pattern without wildcard', async () => {
    const pattern = { pattern: '{青眼の白龍}', type: 'flexible' as const, query: '青眼の白龍' }
    await searchCardPattern(pattern, mockEnv)

    const sql = mockPrepare.mock.calls[0][0]
    expect(sql).toContain('normalized_name = ?')
  })

  it('should use card_id for cardId pattern', async () => {
    const pattern = { pattern: '{{青眼の白龍|4007}}', type: 'cardId' as const, query: '4007' }
    await searchCardPattern(pattern, mockEnv)

    const sql = mockPrepare.mock.calls[0][0]
    expect(sql).toContain('card_id = ?')
    expect(mockBind.mock.calls[0][0]).toBe('4007')
  })

  it('should use = for exact pattern', async () => {
    const pattern = { pattern: '《青眼の白龍》', type: 'exact' as const, query: '青眼の白龍' }
    await searchCardPattern(pattern, mockEnv)

    const sql = mockPrepare.mock.calls[0][0]
    expect(sql).toContain('normalized_name = ?')
  })
})
