import { describe, it, expect, beforeEach } from 'vitest'
import { checkAuth, type ApiKeyInfo } from '../../src/lib/worker/auth.js'
import type { Env } from '../../src/worker.js'

describe('checkAuth', () => {
  let mockEnv: Env

  beforeEach(() => {
    mockEnv = {
      API_SECRET: 'test-master-key',
      DB: {
        prepare: (query: string) => ({
          bind: (...params: unknown[]) => ({
            first: async () => null,
            run: async () => ({ success: true })
          })
        })
      } as unknown as D1Database,
      AI: {} as Fetcher,
      VECTORIZER: {} as VectorizeIndex,
      R2_BUCKET: {} as R2Bucket,
      ENVIRONMENT: 'test',
      AZURE_MODEL: 'test-model'
    }
  })

  it('should reject requests without API secret', async () => {
    const request = new Request('https://example.com/api/test')
    const result = await checkAuth(request, mockEnv)

    expect(result.authorized).toBe(false)
    expect(result.response).toBeDefined()
    expect(result.response?.status).toBe(401)
  })

  it('should accept master key via X-API-Secret header', async () => {
    const request = new Request('https://example.com/api/test', {
      headers: { 'X-API-Secret': 'test-master-key' }
    })
    const result = await checkAuth(request, mockEnv)

    expect(result.authorized).toBe(true)
    expect(result.isMaster).toBe(true)
    expect(result.apiKey).toBeUndefined()
  })

  it('should accept master key via Authorization Bearer header', async () => {
    const request = new Request('https://example.com/api/test', {
      headers: { 'Authorization': 'Bearer test-master-key' }
    })
    const result = await checkAuth(request, mockEnv)

    expect(result.authorized).toBe(true)
    expect(result.isMaster).toBe(true)
  })

  it('should accept valid user API key', async () => {
    const mockKey = {
      id: 'user-key-123',
      user_id: 'user-456',
      name: 'Test Key',
      scopes: JSON.stringify(['cards:read', 'faqs:read']),
      rate_limit: 1000,
      is_active: 1,
      last_used_at: null,
      expires_at: null
    }

    mockEnv.DB = {
      prepare: (query: string) => ({
        bind: (...params: unknown[]) => ({
          first: async () => mockKey,
          run: async () => ({ success: true })
        })
      })
    } as unknown as D1Database

    const request = new Request('https://example.com/api/test', {
      headers: { 'X-API-Secret': 'user-key-123' }
    })
    const result = await checkAuth(request, mockEnv)

    expect(result.authorized).toBe(true)
    expect(result.isMaster).toBe(false)
    expect(result.apiKey).toBeDefined()
    expect(result.apiKey?.id).toBe('user-key-123')
    expect(result.apiKey?.userId).toBe('user-456')
    expect(result.apiKey?.scopes).toEqual(['cards:read', 'faqs:read'])
  })

  it('should reject expired API key', async () => {
    const mockKey = {
      id: 'user-key-123',
      user_id: 'user-456',
      name: 'Test Key',
      scopes: null,
      rate_limit: 1000,
      is_active: 1,
      last_used_at: null,
      expires_at: new Date(Date.now() - 86400000).toISOString() // Expired 1 day ago
    }

    mockEnv.DB = {
      prepare: (query: string) => ({
        bind: (...params: unknown[]) => ({
          first: async () => mockKey,
          run: async () => ({ success: true })
        })
      })
    } as unknown as D1Database

    const request = new Request('https://example.com/api/test', {
      headers: { 'X-API-Secret': 'user-key-123' }
    })
    const result = await checkAuth(request, mockEnv)

    expect(result.authorized).toBe(false)
    expect(result.response?.status).toBe(401)
  })

  it('should reject invalid API key', async () => {
    const request = new Request('https://example.com/api/test', {
      headers: { 'X-API-Secret': 'invalid-key' }
    })
    const result = await checkAuth(request, mockEnv)

    expect(result.authorized).toBe(false)
    expect(result.response?.status).toBe(401)
  })

  it('should handle database errors gracefully', async () => {
    mockEnv.DB = {
      prepare: (query: string) => ({
        bind: (...params: unknown[]) => ({
          first: async () => {
            throw new Error('Database error')
          },
          run: async () => ({ success: true })
        })
      })
    } as unknown as D1Database

    const request = new Request('https://example.com/api/test', {
      headers: { 'X-API-Secret': 'some-key' }
    })
    const result = await checkAuth(request, mockEnv)

    expect(result.authorized).toBe(false)
    expect(result.response?.status).toBe(500)
  })
})
