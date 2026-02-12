/**
 * Authentication utilities for worker API endpoints
 */

import type { Env } from '../../worker.js'

/**
 * Check API authentication
 * @param request - The incoming request
 * @param env - The environment variables
 * @returns Authentication result with optional error response
 */
export function checkAuth(request: Request, env: Env): { authorized: boolean; response?: Response } {
  const apiSecret = request.headers.get('X-API-Secret') || request.headers.get('Authorization')?.replace('Bearer ', '')

  if (!apiSecret || apiSecret !== env.API_SECRET) {
    return {
      authorized: false,
      response: createUnauthorizedResponse()
    }
  }

  return { authorized: true }
}

function createUnauthorizedResponse(): Response {
  return Response.json({
    error: 'Unauthorized - API token required',
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
