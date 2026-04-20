import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleReplaceCards } from '../../src/lib/worker/handlers/replace-cards.js'
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

describe('handleReplaceCards', () => {
  describe('validation', () => {
    it('should return 400 if text is missing', async () => {
      const request = new Request('http://localhost/api/cards/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const response = await handleReplaceCards(request, mockEnv)
      expect(response.status).toBe(400)
    })

    it('should return 400 if text exceeds 10000 characters', async () => {
      const request = new Request('http://localhost/api/cards/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'a'.repeat(10001) })
      })
      const response = await handleReplaceCards(request, mockEnv)
      expect(response.status).toBe(400)
    })

    it('should return unmodified text if no patterns found', async () => {
      const request = new Request('http://localhost/api/cards/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'ただのテキスト' })
      })
      const response = await handleReplaceCards(request, mockEnv)
      const data = await response.json() as { processedText: string; hasUnprocessed: boolean }
      expect(data.processedText).toBe('ただのテキスト')
      expect(data.hasUnprocessed).toBe(false)
    })
  })

  describe('pattern replacement', () => {
    it('should replace flexible pattern with {{name|cardId}} format (regression: card.cardId)', async () => {
      setupMockDB([{ card_id: '4007', name: '青眼の白龍', normalized_name: '青眼ノ白龍', card_type: 'monster' }])

      const request = new Request('http://localhost/api/cards/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '{青眼の白龍}を召喚' })
      })
      const response = await handleReplaceCards(request, mockEnv)
      const data = await response.json() as { processedText: string; processedPatterns: Array<{ status: string }> }

      // This verifies card.cardId is used (not card.card_id which would produce 'undefined')
      expect(data.processedText).toBe('{{青眼の白龍|4007}}を召喚')
      expect(data.processedText).not.toContain('undefined')
      expect(data.processedPatterns[0].status).toBe('resolved')
    })

    it('should replace with 《name》 format when mountPar=true', async () => {
      setupMockDB([{ card_id: '4007', name: '青眼の白龍', normalized_name: '青眼ノ白龍', card_type: 'monster' }])

      const request = new Request('http://localhost/api/cards/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '{青眼の白龍}を召喚', mountPar: true })
      })
      const response = await handleReplaceCards(request, mockEnv)
      const data = await response.json() as { processedText: string }
      expect(data.processedText).toBe('《青眼の白龍》を召喚')
    })

    it('should mark as multiple when wildcard matches many cards', async () => {
      setupMockDB([
        { card_id: '4007', name: '青眼の白龍', normalized_name: '青眼ノ白龍', card_type: 'monster' },
        { card_id: '12253', name: '青眼の亜白龍', normalized_name: '青眼ノ亜白龍', card_type: 'monster' }
      ])

      const request = new Request('http://localhost/api/cards/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '{青眼*}を召喚' })
      })
      const response = await handleReplaceCards(request, mockEnv)
      const data = await response.json() as { hasUnprocessed: boolean; processedPatterns: Array<{ status: string }> }
      expect(data.hasUnprocessed).toBe(true)
      expect(data.processedPatterns[0].status).toBe('multiple')
    })

    it('should mark as notfound when no results', async () => {
      setupMockDB([])

      const request = new Request('http://localhost/api/cards/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '{存在しないカード}を召喚' })
      })
      const response = await handleReplaceCards(request, mockEnv)
      const data = await response.json() as { hasUnprocessed: boolean; processedPatterns: Array<{ status: string }> }
      expect(data.hasUnprocessed).toBe(true)
      expect(data.processedPatterns[0].status).toBe('notfound')
    })
  })
})
