/**
 * E2E Tests for Production API Endpoints
 *
 * These tests run against the deployed production environment.
 * Set PROD_URL environment variable to test against a specific deployment.
 *
 * Usage:
 *   PROD_URL=https://ygo-search.api.scioj.com npm run test:e2e
 *
 * Note: These tests are skipped by default in CI.
 * Run them manually after deployment to verify production functionality.
 */

import { describe, it, expect, beforeAll } from 'vitest'

const PROD_URL = process.env.PROD_URL || 'http://localhost:40040'
const SKIP_E2E = !process.env.RUN_E2E_TESTS

// Helper function to fetch with auth header
async function fetchWithAuth(url: string, options?: RequestInit): Promise<Response> {
  // Use ADMIN_API_KEY for daily operations (required for security best practices)
  const apiKey = process.env.ADMIN_API_KEY
  if (!apiKey) {
    throw new Error(
      'ADMIN_API_KEY environment variable is required. ' +
      'Generate one with: POST /api/keys using master key (API_SECRET). ' +
      'See docs/deployment.md for details.'
    )
  }
  return fetch(url, {
    ...options,
    headers: {
      ...options?.headers,
      'X-API-Secret': apiKey
    }
  })
}

describe.skipIf(SKIP_E2E)('Production API Endpoints', () => {
  beforeAll(() => {
    console.log(`Testing against: ${PROD_URL}`)
  })

  describe('Basic Endpoints', () => {
    it('should return healthy status', async () => {
      const res = await fetch(`${PROD_URL}/health`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('status', 'healthy')
      expect(data).toHaveProperty('timestamp')
    })

    it('should return stats', async () => {
      const res = await fetchWithAuth(`${PROD_URL}/api/stats`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('cards')
      expect(data).toHaveProperty('faqs')
      expect(data.cards).toBeGreaterThan(0)
      expect(data.faqs).toBeGreaterThan(0)
    })

    it('should return API documentation', async () => {
      const res = await fetch(`${PROD_URL}/api/docs?list`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('version')
      expect(data).toHaveProperty('endpoints')
      expect(Array.isArray(data.endpoints)).toBe(true)
      expect(data.endpoints.length).toBeGreaterThan(0)
    })
  })

  describe('Card Search', () => {
    it('should search cards by name', async () => {
      const params = new URLSearchParams({ 'filter[name]': '青眼の白龍' })
      const res = await fetchWithAuth(`${PROD_URL}/api/cards/search?${params}`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('data')
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data.length).toBeGreaterThan(0)
      expect(data.data[0]).toHaveProperty('name', '青眼の白龍')
    })

    it('should get card by ID', async () => {
      const res = await fetchWithAuth(`${PROD_URL}/api/cards/by-id?id=4007`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('card_id', '4007')
      expect(data).toHaveProperty('name')
    })

    it('should seek random cards', async () => {
      const res = await fetchWithAuth(`${PROD_URL}/api/cards/seek?max=5&random=true`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('data')
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data.length).toBeLessThanOrEqual(5)
    })

    it('should perform bulk search', async () => {
      const body = {
        queries: [
          { filter: { name: '青眼の白龍' }, limit: 1 },
          { filter: { attribute: 'light' }, limit: 2 }
        ]
      }

      const res = await fetchWithAuth(`${PROD_URL}/api/cards/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('results')
      expect(Array.isArray(data.results)).toBe(true)
      expect(data.results.length).toBe(2)
    })
  })

  describe('Card Pattern Operations', () => {
    it('should extract card patterns', async () => {
      const body = { text: 'Use {青眼} and 《ブラック・マジシャン》 cards' }

      const res = await fetchWithAuth(`${PROD_URL}/api/cards/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('matches')
      expect(Array.isArray(data.matches)).toBe(true)
      expect(data.matches.length).toBeGreaterThan(0)
    })

    it('should replace card patterns', async () => {
      const body = { text: 'Use {青眼の白龍} card' }

      const res = await fetchWithAuth(`${PROD_URL}/api/cards/replace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('processedText')
      expect(data).toHaveProperty('hasUnprocessed')
      expect(data).toHaveProperty('processedPatterns')
    })
  })

  describe('Semantic Search', () => {
    it('should perform semantic card search', async () => {
      const params = new URLSearchParams({ q: 'dragon', limit: '3' })
      const res = await fetchWithAuth(`${PROD_URL}/api/cards/semantic-search?${params}`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('query', 'dragon')
      expect(data).toHaveProperty('data')
      expect(Array.isArray(data.data)).toBe(true)
      // Note: Results may be empty if vectorization hasn't been performed
    })

    it('should perform semantic FAQ search', async () => {
      const params = new URLSearchParams({ q: '召喚', limit: '3' })
      const res = await fetchWithAuth(`${PROD_URL}/api/faqs/semantic-search?${params}`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('query', '召喚')
      expect(data).toHaveProperty('data')
      expect(Array.isArray(data.data)).toBe(true)
    })
  })

  describe('FAQ Search', () => {
    it('should search FAQs', async () => {
      const params = new URLSearchParams({ q: '召喚', limit: '5' })
      const res = await fetchWithAuth(`${PROD_URL}/api/faqs/search?${params}`)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('query', '召喚')
      expect(data).toHaveProperty('data')
      expect(Array.isArray(data.data)).toBe(true)
    })
  })

  describe('Format Conversion', () => {
    it('should convert JSON to JSONL', async () => {
      const body = {
        input: '[{"id":1},{"id":2}]',
        inputFormat: 'json',
        outputFormat: 'jsonl'
      }

      const res = await fetchWithAuth(`${PROD_URL}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data).toHaveProperty('converted')
      expect(data).toHaveProperty('inputFormat', 'json')
      expect(data).toHaveProperty('outputFormat', 'jsonl')
      expect(data.converted).toContain('\n')
    })
  })
})
