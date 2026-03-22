import { describe, it, expect, beforeAll } from 'bun:test'
import { unstable_dev } from 'wrangler'
import type { UnstableDevWorker } from 'wrangler'

describe('API Keys Management E2E', () => {
  let worker: UnstableDevWorker
  let masterKey: string
  let testUserId: string
  let createdApiKey: string

  beforeAll(async () => {
    worker = await unstable_dev('src/worker.ts', {
      experimental: { disableExperimentalWarning: true }
    })
    masterKey = 'test-master-key' // Should match API_SECRET in test env
    testUserId = `test-user-${Date.now()}`
  })

  it('should reject API key creation without master key', async () => {
    const response = await worker.fetch('http://localhost/api/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Secret': 'invalid-key'
      },
      body: JSON.stringify({
        userId: testUserId,
        name: 'Test Key'
      })
    })

    expect(response.status).toBe(401)
  })

  it('should create API key with master key', async () => {
    const response = await worker.fetch('http://localhost/api/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Secret': masterKey
      },
      body: JSON.stringify({
        userId: testUserId,
        name: 'Test Key',
        scopes: ['cards:read'],
        rateLimit: 500
      })
    })

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data).toHaveProperty('apiKey')
    expect(data.userId).toBe(testUserId)
    expect(data.name).toBe('Test Key')
    expect(data.scopes).toEqual(['cards:read'])
    expect(data.rateLimit).toBe(500)

    createdApiKey = data.apiKey
  })

  it('should list API keys with master key', async () => {
    const response = await worker.fetch('http://localhost/api/keys', {
      method: 'GET',
      headers: {
        'X-API-Secret': masterKey
      }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('keys')
    expect(Array.isArray(data.keys)).toBe(true)
    expect(data.keys.length).toBeGreaterThan(0)

    const createdKey = data.keys.find((k: { id: string }) => k.id === createdApiKey)
    expect(createdKey).toBeDefined()
    expect(createdKey.userId).toBe(testUserId)
  })

  it('should list only own API keys with user key', async () => {
    const response = await worker.fetch('http://localhost/api/keys', {
      method: 'GET',
      headers: {
        'X-API-Secret': createdApiKey
      }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('keys')
    expect(Array.isArray(data.keys)).toBe(true)

    // User should only see their own keys
    const allKeysMatchUser = data.keys.every((k: { userId: string }) => k.userId === testUserId)
    expect(allKeysMatchUser).toBe(true)
  })

  it('should authenticate with created API key', async () => {
    const response = await worker.fetch('http://localhost/api/stats', {
      method: 'GET',
      headers: {
        'X-API-Secret': createdApiKey
      }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('totalCards')
  })

  it('should get API logs', async () => {
    const response = await worker.fetch('http://localhost/api/keys/logs?limit=10', {
      method: 'GET',
      headers: {
        'X-API-Secret': masterKey
      }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toHaveProperty('logs')
    expect(Array.isArray(data.logs)).toBe(true)
  })

  it('should deactivate API key', async () => {
    const response = await worker.fetch(`http://localhost/api/keys/${createdApiKey}`, {
      method: 'DELETE',
      headers: {
        'X-API-Secret': masterKey
      }
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.message).toContain('deactivated')
  })

  it('should reject deactivated API key', async () => {
    const response = await worker.fetch('http://localhost/api/stats', {
      method: 'GET',
      headers: {
        'X-API-Secret': createdApiKey
      }
    })

    expect(response.status).toBe(401)
  })

  it('should prevent non-admin from creating API keys', async () => {
    // Create another API key for testing
    const createResponse = await worker.fetch('http://localhost/api/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Secret': masterKey
      },
      body: JSON.stringify({
        userId: testUserId,
        name: 'User Key'
      })
    })
    const { apiKey } = await createResponse.json()

    // Try to create another key with user key (should fail)
    const response = await worker.fetch('http://localhost/api/keys', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Secret': apiKey
      },
      body: JSON.stringify({
        userId: 'another-user',
        name: 'Should Fail'
      })
    })

    expect(response.status).toBe(403)

    // Cleanup
    await worker.fetch(`http://localhost/api/keys/${apiKey}`, {
      method: 'DELETE',
      headers: { 'X-API-Secret': masterKey }
    })
  })
})
