/**
 * API Key management handlers
 */

import type { Env } from '../../../worker.js'
import type { AuthResult } from '../auth.js'

/**
 * Generate a random API key
 */
function generateApiKey(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

/**
 * Create a new API key (admin only)
 * POST /api/keys
 */
export async function handleCreateApiKey(
  request: Request,
  env: Env,
  authResult: AuthResult
): Promise<Response> {
  // Only master key can create API keys
  if (!authResult.isMaster) {
    return Response.json({
      error: 'Forbidden - Admin access required',
      code: 'FORBIDDEN'
    }, { status: 403 })
  }

  try {
    const body = await request.json() as {
      userId: string
      name?: string
      scopes?: string[]
      rateLimit?: number
      expiresAt?: string
    }

    if (!body.userId) {
      return Response.json({
        error: 'userId is required',
        code: 'INVALID_REQUEST'
      }, { status: 400 })
    }

    const apiKey = generateApiKey()
    const scopes = body.scopes || ['cards:read', 'faqs:read']
    const rateLimit = body.rateLimit || 1000

    await env.DB.prepare(`
      INSERT INTO api_keys (id, user_id, name, scopes, rate_limit, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      apiKey,
      body.userId,
      body.name || null,
      JSON.stringify(scopes),
      rateLimit,
      body.expiresAt || null
    ).run()

    return Response.json({
      apiKey,
      userId: body.userId,
      name: body.name || null,
      scopes,
      rateLimit,
      expiresAt: body.expiresAt || null,
      createdAt: new Date().toISOString()
    }, { status: 201 })
  } catch (error) {
    console.error('Create API key error:', error)
    return Response.json({
      error: 'Failed to create API key',
      code: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
}

/**
 * List API keys
 * GET /api/keys
 */
export async function handleListApiKeys(
  request: Request,
  env: Env,
  authResult: AuthResult
): Promise<Response> {
  try {
    let query: string
    let params: string[]

    // Master key can see all keys, user key can only see their own
    if (authResult.isMaster) {
      query = `
        SELECT id, user_id, name, scopes, rate_limit, is_active, created_at, last_used_at, expires_at
        FROM api_keys
        ORDER BY created_at DESC
      `
      params = []
    } else {
      if (!authResult.apiKey) {
        return Response.json({
          error: 'Invalid authentication state',
          code: 'INTERNAL_ERROR'
        }, { status: 500 })
      }

      query = `
        SELECT id, user_id, name, scopes, rate_limit, is_active, created_at, last_used_at, expires_at
        FROM api_keys
        WHERE user_id = ?
        ORDER BY created_at DESC
      `
      params = [authResult.apiKey.userId]
    }

    const stmt = env.DB.prepare(query)
    const result = params.length > 0 ? await stmt.bind(...params).all() : await stmt.all()

    const keys = (result.results as Array<{
      id: string
      user_id: string
      name: string | null
      scopes: string | null
      rate_limit: number
      is_active: number
      created_at: string
      last_used_at: string | null
      expires_at: string | null
    }>).map(key => ({
      id: key.id,
      userId: key.user_id,
      name: key.name,
      scopes: key.scopes ? JSON.parse(key.scopes) as string[] : [],
      rateLimit: key.rate_limit,
      isActive: Boolean(key.is_active),
      createdAt: key.created_at,
      lastUsedAt: key.last_used_at,
      expiresAt: key.expires_at
    }))

    return Response.json({ keys })
  } catch (error) {
    console.error('List API keys error:', error)
    return Response.json({
      error: 'Failed to list API keys',
      code: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
}

/**
 * Delete (deactivate) an API key
 * DELETE /api/keys/:id
 */
export async function handleDeleteApiKey(
  request: Request,
  env: Env,
  authResult: AuthResult,
  keyId: string
): Promise<Response> {
  try {
    // Check if key exists and user has permission
    const key = await env.DB.prepare(`
      SELECT user_id FROM api_keys WHERE id = ?
    `).bind(keyId).first<{ user_id: string }>()

    if (!key) {
      return Response.json({
        error: 'API key not found',
        code: 'NOT_FOUND'
      }, { status: 404 })
    }

    // Master key can delete any key, user key can only delete their own
    if (!authResult.isMaster && authResult.apiKey?.userId !== key.user_id) {
      return Response.json({
        error: 'Forbidden - Cannot delete other users API keys',
        code: 'FORBIDDEN'
      }, { status: 403 })
    }

    // Deactivate the key (soft delete)
    await env.DB.prepare(`
      UPDATE api_keys SET is_active = false WHERE id = ?
    `).bind(keyId).run()

    return Response.json({
      message: 'API key deactivated successfully',
      keyId
    })
  } catch (error) {
    console.error('Delete API key error:', error)
    return Response.json({
      error: 'Failed to delete API key',
      code: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
}

/**
 * Get API usage logs
 * GET /api/keys/logs
 */
export async function handleGetApiLogs(
  request: Request,
  env: Env,
  authResult: AuthResult
): Promise<Response> {
  try {
    const url = new URL(request.url)
    const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '100'), 1000)
    const offset = Math.max(Number.parseInt(url.searchParams.get('offset') || '0'), 0)

    let query: string
    let params: (string | number)[]

    // Master key can see all logs, user key can only see their own
    if (authResult.isMaster) {
      query = `
        SELECT l.id, l.api_key_id, l.endpoint, l.method, l.status, l.ip_address, l.user_agent, l.created_at
        FROM api_logs l
        ORDER BY l.created_at DESC
        LIMIT ? OFFSET ?
      `
      params = [limit, offset]
    } else {
      if (!authResult.apiKey) {
        return Response.json({
          error: 'Invalid authentication state',
          code: 'INTERNAL_ERROR'
        }, { status: 500 })
      }

      query = `
        SELECT l.id, l.api_key_id, l.endpoint, l.method, l.status, l.ip_address, l.user_agent, l.created_at
        FROM api_logs l
        JOIN api_keys k ON l.api_key_id = k.id
        WHERE k.user_id = ?
        ORDER BY l.created_at DESC
        LIMIT ? OFFSET ?
      `
      params = [authResult.apiKey.userId, limit, offset]
    }

    const result = await env.DB.prepare(query).bind(...params).all()

    const logs = (result.results as Array<{
      id: number
      api_key_id: string
      endpoint: string
      method: string
      status: number
      ip_address: string | null
      user_agent: string | null
      created_at: string
    }>).map(log => ({
      id: log.id,
      apiKeyId: log.api_key_id,
      endpoint: log.endpoint,
      method: log.method,
      status: log.status,
      ipAddress: log.ip_address,
      userAgent: log.user_agent,
      createdAt: log.created_at
    }))

    return Response.json({ logs, limit, offset })
  } catch (error) {
    console.error('Get API logs error:', error)
    return Response.json({
      error: 'Failed to get API logs',
      code: 'INTERNAL_ERROR'
    }, { status: 500 })
  }
}
