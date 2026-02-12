/**
 * Unit tests for info handlers (handleCardById, handleStats)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleCardById, handleStats } from '../../src/lib/worker/handlers/info.js'
import type { Env } from '../../src/worker.js'

// Mock database module
vi.mock('../../src/lib/worker/database.js', () => ({
  getCardById: vi.fn(),
  getStats: vi.fn()
}))

import { getCardById, getStats } from '../../src/lib/worker/database.js'

// Mock environment
const mockEnv: Env = {
  DB: {} as any,
  ANALYTICS: undefined,
  VECTORIZER: undefined,
  R2_BUCKET: undefined,
  AI: undefined,
  AZURE_API_KEY: undefined,
  AZURE_MODEL: undefined,
  AZURE_ENDPOINT: undefined,
  API_SECRET: undefined
}

describe('handleCardById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return error when id parameter is missing', async () => {
    const url = new URL('http://localhost/api/cards/by-id')
    const request = new Request(url.toString())

    const response = await handleCardById(request, url, mockEnv)

    expect(response.status).toBe(400)
    const errorData = await response.json()
    expect(errorData.error).toBe('Missing id parameter')
  })

  it('should return error when id format is invalid', async () => {
    const testCases = [
      'abc',      // non-numeric
      '123abc',   // mixed
      '12.34',    // decimal
      '-123',     // negative
      '123 456'   // with space
    ]

    for (const invalidId of testCases) {
      const url = new URL(`http://localhost/api/cards/by-id?id=${encodeURIComponent(invalidId)}`)
      const request = new Request(url.toString())

      const response = await handleCardById(request, url, mockEnv)

      expect(response.status).toBe(400)
      const errorData = await response.json()
      expect(errorData.error).toBe('Invalid card ID format')
    }
  })

  it('should return error when card is not found', async () => {
    vi.mocked(getCardById).mockResolvedValue(null)

    const url = new URL('http://localhost/api/cards/by-id?id=99999')
    const request = new Request(url.toString())

    const response = await handleCardById(request, url, mockEnv)

    expect(response.status).toBe(404)
    const errorData = await response.json()
    expect(errorData.error).toBe('Card not found')
    expect(getCardById).toHaveBeenCalledWith('99999', mockEnv)
  })

  it('should return card data when valid id is provided', async () => {
    const mockCard = {
      card_id: '4007',
      name: '青眼の白龍',
      ruby: 'ブルーアイズ・ホワイト・ドラゴン',
      card_type: 'monster',
      attribute: 'light',
      level: 8,
      atk: 3000,
      def: 2500
    }

    vi.mocked(getCardById).mockResolvedValue(mockCard)

    const url = new URL('http://localhost/api/cards/by-id?id=4007')
    const request = new Request(url.toString())

    const response = await handleCardById(request, url, mockEnv)

    expect(response.status).toBe(200)
    const responseData = await response.json()
    expect(responseData).toEqual(mockCard)
    expect(getCardById).toHaveBeenCalledWith('4007', mockEnv)
  })

  it('should handle database errors gracefully', async () => {
    vi.mocked(getCardById).mockRejectedValue(new Error('Database connection failed'))

    const url = new URL('http://localhost/api/cards/by-id?id=4007')
    const request = new Request(url.toString())

    const response = await handleCardById(request, url, mockEnv)

    expect(response.status).toBe(500)
    const errorData = await response.json()
    expect(errorData.error).toBe('Internal server error')
    expect(getCardById).toHaveBeenCalledWith('4007', mockEnv)
  })
})

describe('handleStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return database statistics', async () => {
    const mockStats = {
      cards: 12500,
      faqs: 3200,
      timestamp: '2026-02-07T23:00:00.000Z'
    }

    vi.mocked(getStats).mockResolvedValue(mockStats)

    const response = await handleStats(mockEnv)

    expect(response.status).toBe(200)
    const responseData = await response.json()
    expect(responseData).toEqual(mockStats)
    expect(getStats).toHaveBeenCalledWith(mockEnv)
  })

  it('should handle database errors gracefully', async () => {
    vi.mocked(getStats).mockRejectedValue(new Error('Failed to query database'))

    const response = await handleStats(mockEnv)

    expect(response.status).toBe(500)
    const errorData = await response.json()
    expect(errorData.error).toBe('Internal server error')
    expect(getStats).toHaveBeenCalledWith(mockEnv)
  })

  it('should handle zero counts correctly', async () => {
    const mockEmptyStats = {
      cards: 0,
      faqs: 0,
      timestamp: '2026-02-07T23:00:00.000Z'
    }

    vi.mocked(getStats).mockResolvedValue(mockEmptyStats)

    const response = await handleStats(mockEnv)

    expect(response.status).toBe(200)
    const responseData = await response.json()
    expect(responseData).toEqual(mockEmptyStats)
    expect(responseData.cards).toBe(0)
    expect(responseData.faqs).toBe(0)
    expect(getStats).toHaveBeenCalledWith(mockEnv)
  })
})

describe('Parameter Validation Edge Cases', () => {
  it('should validate numeric ID patterns', () => {
    const validIds = ['1', '123', '4007', '99999']
    const invalidIds = ['0x123', '1e5', '1.0', 'NaN', 'Infinity']

    for (const id of validIds) {
      expect(/^\d+$/.test(id)).toBe(true)
    }

    for (const id of invalidIds) {
      expect(/^\d+$/.test(id)).toBe(false)
    }
  })

  it('should handle URL encoding correctly', () => {
    const testCases = [
      { encoded: '4007', decoded: '4007' },
      { encoded: '%20123', decoded: ' 123' }, // space should be invalid
      { encoded: '123%2F456', decoded: '123/456' } // slash should be invalid
    ]

    for (const { encoded, decoded } of testCases) {
      const url = new URL(`http://localhost/api/cards/by-id?id=${encoded}`)
      const id = url.searchParams.get('id')
      expect(id).toBe(decoded)

      if (decoded === '4007') {
        expect(/^\d+$/.test(id!)).toBe(true)
      } else {
        expect(/^\d+$/.test(id!)).toBe(false)
      }
    }
  })
})
