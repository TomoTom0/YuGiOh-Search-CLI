import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleFAQSearch } from '../../src/lib/worker/handlers/faq-search.js'
import type { Env } from '../../src/worker.js'

const mockPrepare = vi.fn()
const mockBind = vi.fn()
const mockAll = vi.fn()
const mockFirst = vi.fn()

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

function setupMockDB(result: { results?: unknown[]; first?: unknown }) {
  mockAll.mockResolvedValue({ results: result.results || [] })
  mockFirst.mockResolvedValue(result.first || null)
  mockBind.mockReturnValue({ all: mockAll, first: mockFirst })
  mockPrepare.mockReturnValue({ bind: mockBind })
}

function setupMockDBSequence(results: Array<{ results?: unknown[]; first?: unknown }>) {
  let callIndex = 0
  mockAll.mockImplementation(() => {
    const r = results[callIndex] || { results: [] }
    callIndex++
    return Promise.resolve(r)
  })
  mockFirst.mockImplementation(() => {
    const r = results[callIndex] || { first: null }
    callIndex++
    return Promise.resolve(r.first || null)
  })
  mockBind.mockReturnValue({ all: mockAll, first: mockFirst })
  mockPrepare.mockReturnValue({ bind: mockBind })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleFAQSearch', () => {
  describe('parameter extraction - GET', () => {
    it('should extract q parameter and build OR query', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search?q=test')
      const request = new Request(url.toString())

      await handleFAQSearch(request, url, mockEnv)

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('normalized_question LIKE ? OR f.normalized_answer LIKE ?')
      )
      expect(mockBind).toHaveBeenCalledWith(
        expect.stringContaining('test'), expect.stringContaining('test'), 10, 0
      )
    })

    it('should extract faqId from GET query string', async () => {
      setupMockDB({ first: { faq_id: 1, card_id: null, question: 'Q', answer: 'A', created_at: '2026-01-01' } })
      const url = new URL('http://localhost/api/faqs/search?faqId=1')
      const request = new Request(url.toString())

      const response = await handleFAQSearch(request, url, mockEnv)
      const data = await response.json()

      expect(data.data).toHaveLength(1)
      expect(data.data[0].faqId).toBe(1)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE f.faq_id = ?')
      )
      expect(mockBind).toHaveBeenCalledWith(1)
    })

    it('should extract cardId and query faq_card_references', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search?cardId=89631139')
      const request = new Request(url.toString())

      await handleFAQSearch(request, url, mockEnv)

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INNER JOIN faq_card_references')
      )
      expect(mockBind).toHaveBeenCalledWith('89631139', 10, 0)
    })

    it('should extract cardName and resolve via cards table', async () => {
      setupMockDB({ results: [{ faq_id: 1, card_id: '89631139', question: 'Q', answer: 'A', created_at: '2026-01-01' }] })
      const url = new URL('http://localhost/api/faqs/search?cardName=青眼')
      const request = new Request(url.toString())

      const response = await handleFAQSearch(request, url, mockEnv)
      const data = await response.json()

      expect(data.total).toBe(1)
      // Single subquery: card resolution and FAQ lookup combined
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('FROM cards WHERE normalized_name LIKE ?')
      )
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('faq_card_references')
      )
    })

    it('should extract question and answer and build AND query', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search?question=召喚&answer=墓地')
      const request = new Request(url.toString())

      await handleFAQSearch(request, url, mockEnv)

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('normalized_question LIKE ? AND f.normalized_answer LIKE ?')
      )
    })

    it('should extract question only and build single-field query', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search?question=召喚')
      const request = new Request(url.toString())

      await handleFAQSearch(request, url, mockEnv)

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE f.normalized_question LIKE ?')
      )
      expect(mockPrepare).not.toHaveBeenCalledWith(
        expect.stringContaining('OR')
      )
    })
  })

  describe('parameter extraction - POST', () => {
    it('should extract question and answer from POST JSON body', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search')
      const request = new Request(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: '召喚', answer: '墓地' })
      })

      await handleFAQSearch(request, url, mockEnv)

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('normalized_question LIKE ? AND f.normalized_answer LIKE ?')
      )
    })

    it('should extract cardFilter from POST body and build card filter query', async () => {
      setupMockDB({ results: [{ faq_id: 1, card_id: '89631139', question: 'Q', answer: 'A', created_at: '2026-01-01' }] })
      const url = new URL('http://localhost/api/faqs/search')
      const request = new Request(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardFilter: { name: '青眼' } })
      })

      const response = await handleFAQSearch(request, url, mockEnv)
      const data = await response.json()

      expect(data.total).toBe(1)
      // Single subquery: card filter and FAQ lookup combined
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('FROM cards WHERE')
      )
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('faq_card_references')
      )
    })

    it('should reject cardFilter via GET with no parameters', async () => {
      const url = new URL('http://localhost/api/faqs/search')
      const request = new Request(url.toString())

      const response = await handleFAQSearch(request, url, mockEnv)
      expect(response.status).toBe(400)
    })

    it('should ignore non-string body fields gracefully', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search')
      const request = new Request(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 12345, question: null, cardFilter: 'not-an-object' })
      })

      const response = await handleFAQSearch(request, url, mockEnv)
      // q is not a string, question is null, cardFilter is not an object
      // So no valid params → 400
      expect(response.status).toBe(400)
    })
  })

  describe('priority order', () => {
    it('faqId takes priority over q and cardId', async () => {
      setupMockDB({ first: { faq_id: 5, card_id: null, question: 'Q5', answer: 'A5', created_at: '2026-01-01' } })
      const url = new URL('http://localhost/api/faqs/search?faqId=5&q=test&cardId=89631139')
      const request = new Request(url.toString())

      const response = await handleFAQSearch(request, url, mockEnv)
      const data = await response.json()

      expect(data.data[0].faqId).toBe(5)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE f.faq_id = ?')
      )
      // Only one DB call for faqId
      expect(mockPrepare).toHaveBeenCalledTimes(1)
    })

    it('cardId takes priority over text search', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search?cardId=89631139&q=test')
      const request = new Request(url.toString())

      await handleFAQSearch(request, url, mockEnv)

      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('faq_card_references')
      )
    })

    it('cardName takes priority over text search', async () => {
      setupMockDBSequence([
        { results: [] }
      ])
      const url = new URL('http://localhost/api/faqs/search?cardName=青眼&q=test')
      const request = new Request(url.toString())

      await handleFAQSearch(request, url, mockEnv)

      // Should query cards table, not faqs with LIKE
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('FROM cards')
      )
    })
  })

  describe('validation', () => {
    it('should return error when no parameters provided', async () => {
      const url = new URL('http://localhost/api/faqs/search')
      const request = new Request(url.toString())

      const response = await handleFAQSearch(request, url, mockEnv)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('Missing query parameter')
    })

    it('should return error for invalid faqId', async () => {
      const url = new URL('http://localhost/api/faqs/search?faqId=abc')
      const request = new Request(url.toString())

      const response = await handleFAQSearch(request, url, mockEnv)
      expect(response.status).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('faqId must be a number')
    })

    it('should return empty results when faqId not found', async () => {
      setupMockDB({ first: null })
      const url = new URL('http://localhost/api/faqs/search?faqId=99999')
      const request = new Request(url.toString())

      const response = await handleFAQSearch(request, url, mockEnv)
      const data = await response.json()

      expect(data.data).toHaveLength(0)
      expect(data.total).toBe(0)
    })

    it('should return empty results when cardName matches no cards', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search?cardName=存在しないカード')
      const request = new Request(url.toString())

      const response = await handleFAQSearch(request, url, mockEnv)
      const data = await response.json()

      expect(data.data).toHaveLength(0)
      expect(data.total).toBe(0)
      // Only one DB call (card resolution), no FAQ query needed
      expect(mockPrepare).toHaveBeenCalledTimes(1)
    })
  })

  describe('snake_case to camelCase mapping', () => {
    it('should convert DB columns to camelCase in response', async () => {
      setupMockDB({
        results: [{
          faq_id: 42,
          card_id: '89631139',
          question: '質問文',
          answer: '回答文',
          created_at: '2026-04-19T00:00:00Z'
        }]
      })
      const url = new URL('http://localhost/api/faqs/search?q=test')
      const request = new Request(url.toString())

      const response = await handleFAQSearch(request, url, mockEnv)
      const data = await response.json()

      expect(data.data[0]).toEqual({
        faqId: 42,
        cardId: '89631139',
        question: '質問文',
        answer: '回答文',
        createdAt: '2026-04-19T00:00:00Z'
      })
      // Verify no snake_case keys leak into response
      expect(data.data[0]).not.toHaveProperty('faq_id')
      expect(data.data[0]).not.toHaveProperty('card_id')
      expect(data.data[0]).not.toHaveProperty('created_at')
    })
  })

  describe('backward compatibility', () => {
    it('should work with existing GET ?q= parameter', async () => {
      setupMockDB({
        results: [{
          faq_id: 1,
          card_id: null,
          question: 'Q',
          answer: 'A',
          created_at: '2026-01-01'
        }]
      })
      const url = new URL('http://localhost/api/faqs/search?q=test')
      const request = new Request(url.toString())

      const response = await handleFAQSearch(request, url, mockEnv)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toHaveLength(1)
      expect(data.query.q).toBe('test')
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('normalized_question LIKE ? OR f.normalized_answer LIKE ?')
      )
    })
  })

  describe('wildcard support', () => {
    it('should wrap pattern with % by default (allowWild=true)', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search?q=青眼')
      const request = new Request(url.toString())

      await handleFAQSearch(request, url, mockEnv)

      // Default allowWild=true: pattern should be wrapped with %
      expect(mockBind).toHaveBeenCalled()
      const firstBindArg = mockBind.mock.calls[0][0]
      expect(firstBindArg).toMatch(/^%.*%$/)
    })

    it('should disable wildcard when allowWild=false', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search?q=青眼&allowWild=false')
      const request = new Request(url.toString())

      await handleFAQSearch(request, url, mockEnv)

      expect(mockBind).toHaveBeenCalled()
      const firstBindArg = mockBind.mock.calls[0][0]
      expect(firstBindArg).toMatch(/^%.*%$/)
    })
  })

  describe('limit and offset', () => {
    it('should clamp limit to MAX_LIMIT', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search?q=test&limit=999')
      const request = new Request(url.toString())

      await handleFAQSearch(request, url, mockEnv)

      expect(mockBind).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), 100, 0
      )
    })

    it('should clamp offset to MAX_OFFSET', async () => {
      setupMockDB({ results: [] })
      const url = new URL('http://localhost/api/faqs/search?q=test&offset=9999')
      const request = new Request(url.toString())

      await handleFAQSearch(request, url, mockEnv)

      expect(mockBind).toHaveBeenCalledWith(
        expect.anything(), expect.anything(), 10, 1000
      )
    })
  })
})
