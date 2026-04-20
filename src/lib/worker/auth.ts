/**
 * Authentication utilities for worker API endpoints
 */

import type { Env } from '../../worker.js'

/**
 * Scope definitions
 */
export const SCOPES = {
  CARDS_READ: 'cards:read',
  FAQS_READ: 'faqs:read',
  STATS_READ: 'stats:read',
  CONVERT: 'convert',
  VECTORIZE: 'vectorize',
  ADMIN: 'admin'
} as const

/**
 * API Key information
 */
export interface ApiKeyInfo {
  id: string
  userId: string
  name: string | null
  scopes: string[]
  rateLimit: number
  isActive: boolean
  lastUsedAt: string | null
  expiresAt: string | null
}

/**
 * Authentication result
 */
export interface AuthResult {
  authorized: boolean
  isMaster?: boolean
  apiKey?: ApiKeyInfo
  response?: Response
}

/**
 * Check if user has required scope
 * @param authResult - Authentication result
 * @param requiredScope - Required scope (e.g., "cards:read", "vectorize")
 * @returns true if authorized
 */
export function hasScope(authResult: AuthResult, requiredScope: string): boolean {
  // Master key has all permissions
  if (authResult.isMaster) {
    return true
  }

  // User API key: check scopes
  if (authResult.apiKey) {
    return authResult.apiKey.scopes.includes(requiredScope)
  }

  return false
}

/**
 * Create forbidden response
 */
function createForbiddenResponse(requiredScope: string): Response {
  return Response.json({
    error: `Forbidden - Required scope: ${requiredScope}`,
    code: 'FORBIDDEN',
    details: [
      `This endpoint requires the '${requiredScope}' scope`,
      'Contact administrator to request access'
    ],
    timestamp: new Date().toISOString()
  }, {
    status: 403,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

/**
 * Check scope and return error response if unauthorized
 * @param authResult - Authentication result
 * @param requiredScope - Required scope
 * @returns Error response if unauthorized, undefined if authorized
 */
export function checkScope(authResult: AuthResult, requiredScope: string): Response | undefined {
  if (!hasScope(authResult, requiredScope)) {
    return createForbiddenResponse(requiredScope)
  }
  return undefined
}

/**
 * Check API authentication
 * @param request - The incoming request
 * @param env - The environment variables
 * @returns Authentication result with optional error response
 */
export async function checkAuth(request: Request, env: Env): Promise<AuthResult> {
  const apiSecret = request.headers.get('X-API-Secret') || request.headers.get('Authorization')?.replace('Bearer ', '')

  if (!apiSecret) {
    return {
      authorized: false,
      response: createUnauthorizedResponse()
    }
  }

  // Check if it's the master key
  if (apiSecret === env.API_SECRET) {
    return {
      authorized: true,
      isMaster: true
    }
  }

  // Check user API key from D1
  try {
    const key = await env.DB.prepare(`
      SELECT id, user_id, name, scopes, rate_limit, is_active, last_used_at, expires_at
      FROM api_keys
      WHERE id = ? AND is_active = true
    `).bind(apiSecret).first<{
      id: string
      user_id: string
      name: string | null
      scopes: string | null
      rate_limit: number
      is_active: number
      last_used_at: string | null
      expires_at: string | null
    }>()

    if (!key) {
      return {
        authorized: false,
        response: createUnauthorizedResponse()
      }
    }

    // Check if key is expired
    if (key.expires_at && new Date(key.expires_at) < new Date()) {
      return {
        authorized: false,
        response: createUnauthorizedResponse('API key has expired')
      }
    }

    // Parse scopes
    const scopes = key.scopes ? JSON.parse(key.scopes) as string[] : []

    // Update last_used_at (fire and forget)
    env.DB.prepare('UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(apiSecret)
      .run()
      .catch(() => {}) // Ignore errors

    return {
      authorized: true,
      isMaster: false,
      apiKey: {
        id: key.id,
        userId: key.user_id,
        name: key.name,
        scopes,
        rateLimit: key.rate_limit,
        isActive: Boolean(key.is_active),
        lastUsedAt: key.last_used_at,
        expiresAt: key.expires_at
      }
    }
  } catch (error) {
    console.error('Auth error:', error)
    return {
      authorized: false,
      response: createInternalErrorResponse()
    }
  }
}

function createUnauthorizedResponse(message?: string): Response {
  return Response.json({
    error: message || 'Unauthorized - API token required',
    code: 'UNAUTHORIZED',
    details: [
      'Include X-API-Secret header with your API token',
      'Example: curl -H "X-API-Secret: your-token" https://...',
      'API documentation: /api/docs'
    ],
    timestamp: new Date().toISOString()
  }, {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

function createInternalErrorResponse(): Response {
  return Response.json({
    error: 'Internal server error during authentication',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  }, {
    status: 500,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}
