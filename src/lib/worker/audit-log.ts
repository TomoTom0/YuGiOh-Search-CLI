/**
 * Audit logging utilities
 */

import type { Env } from '../../worker.js'
import type { AuthResult } from './auth.js'

/**
 * Log API request to api_logs table
 * @param env - The environment variables
 * @param request - The incoming request
 * @param authResult - The authentication result
 * @param status - The HTTP response status
 */
export async function logApiRequest(
  env: Env,
  request: Request,
  authResult: AuthResult | null,
  status: number
): Promise<void> {
  // Only log requests for authenticated users (not master key)
  if (!authResult || authResult.isMaster || !authResult.apiKey) {
    return
  }

  try {
    const url = new URL(request.url)
    const endpoint = url.pathname
    const method = request.method
    const ipAddress = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || null
    const userAgent = request.headers.get('User-Agent') || null

    // Fire and forget - don't wait for the log to be written
    env.DB.prepare(`
      INSERT INTO api_logs (api_key_id, endpoint, method, status, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      authResult.apiKey.id,
      endpoint,
      method,
      status,
      ipAddress,
      userAgent
    ).run().catch(error => {
      console.error('Failed to log API request:', error)
    })
  } catch (error) {
    // Silently fail - don't break the request
    console.error('Audit log error:', error)
  }
}
