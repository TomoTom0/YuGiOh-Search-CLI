import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleBulkSearch } from '../../src/lib/worker/handlers/bulk-search.js'
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

function setupMockDB(results: unknown[]) {
  mockAll.mockResolvedValue({ results })
  mockBind.mockReturnValue({ all: mockAll })
  mockPrepare.mockReturnValue({ bind: mockBind })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('handleBulkSearch', () => {
  describe('validation', () => {
    it('should return 400 if queries is missing', async () => {
      const request = new Request('http://localhost/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const response = await handleBulkSearch(request, mockEnv)
      expect(response.status).toBe(400)
    })

    it('should return 400 if queries is not an array', async () => {
      const request = new Request('http://localhost/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: 'invalid' })
      })
      const response = await handleBulkSearch(request, mockEnv)
      expect(response.status).toBe(400)
    })

    it('should return empty results for empty queries array', async () => {
      const request = new Request('http://localhost/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [] })
      })
      const response = await handleBulkSearch(request, mockEnv)
      const data = await response.json() as { results: unknown[] }
      expect(data.results).toHaveLength(0)
    })
  })

  describe('query execution', () => {
    it('should return results for a single query', async () => {
      setupMockDB([
        { card_id: '4007', name: '青眼の白龍', normalized_name: '青眼ノ白龍', card_type: 'monster', atk: 3000, def: 2500 }
      ])
      const request = new Request('http://localhost/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [{ filter: { name: '青眼の白龍' } }] })
      })
      const response = await handleBulkSearch(request, mockEnv)
      const data = await response.json() as { results: Array<{ query: number; total: number }> }
      expect(data.results).toHaveLength(1)
      expect(data.results[0].query).toBe(0)
      expect(data.results[0].total).toBe(1)
    })

    it('should execute multiple queries independently', async () => {
      let callCount = 0
      mockAll.mockImplementation(() => {
        callCount++
        return Promise.resolve({ results: [{ card_id: String(callCount) }] })
      })
      mockBind.mockReturnValue({ all: mockAll })
      mockPrepare.mockReturnValue({ bind: mockBind })

      const request = new Request('http://localhost/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: [
            { filter: { name: '青眼の白龍' } },
            { filter: { name: 'ブラック・マジシャン' } }
          ]
        })
      })
      const response = await handleBulkSearch(request, mockEnv)
      const data = await response.json() as { results: Array<{ query: number }> }
      expect(data.results).toHaveLength(2)
      expect(data.results[0].query).toBe(0)
      expect(data.results[1].query).toBe(1)
    })

    it('should not add limit/offset to bind params (regression: double-binding bug)', async () => {
      setupMockDB([])
      const request = new Request('http://localhost/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [{ filter: { name: '青眼の白龍' } }] })
      })
      await handleBulkSearch(request, mockEnv)

      // LIMIT/OFFSET are interpolated in SQL string, not bind params
      // bind should only receive the WHERE clause params (name search pattern, ruby pattern)
      const bindArgs: unknown[] = mockBind.mock.calls[0]
      expect(bindArgs.every((arg: unknown) => typeof arg === 'string')).toBe(true)
    })

    it('should respect per-query limit option', async () => {
      setupMockDB([])
      const request = new Request('http://localhost/api/cards/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries: [{ filter: { name: '青眼の白龍' }, limit: 5 }] })
      })
      await handleBulkSearch(request, mockEnv)

      const sql = mockPrepare.mock.calls[0][0]
      expect(sql).toContain('LIMIT 5')
    })
  })
})
