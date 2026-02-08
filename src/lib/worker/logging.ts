/**
 * Logging utilities for worker API endpoints
 */

import type { Env } from '../../worker.js'

interface LogData {
  path: string
  method: string
  status: number
  duration: number
  userAgent?: string
  referer?: string
  clientIP?: string
  timestamp: string
}

/**
 * Log request information to console and Analytics Engine
 * @param env - The environment variables
 * @param request - The incoming request
 * @param status - HTTP status code
 * @param duration - Request duration in milliseconds
 * @param path - Request path
 */
export function logRequest(env: Env, request: Request, status: number, duration: number, path: string): void {
  const logData: LogData = {
    path,
    method: request.method,
    status,
    duration,
    userAgent: request.headers.get('user-agent') || 'unknown',
    referer: request.headers.get('referer') || 'none',
    clientIP: request.headers.get('CF-Connecting-IP') || 'unknown',
    timestamp: new Date().toISOString()
  }

  // Console log for debugging
  console.log(JSON.stringify(logData))

  // Analytics Engine (if enabled)
  if (env.ANALYTICS) {
    try {
      env.ANALYTICS.writeDataPoint({
        blobs: [
          path,
          request.method,
          logData.userAgent ?? 'unknown',
          logData.referer ?? 'none',
          logData.clientIP ?? 'unknown'
        ],
        doubles: [duration],
        indexes: [String(status)]
      })
    } catch (e) {
      console.error('Failed to log to Analytics Engine:', e)
    }
  }
}

/**
 * Log error information
 * @param env - The environment variables
 * @param error - Error object or message
 * @param context - Additional context information
 */
export function logError(env: Env, error: Error | string, context: Record<string, any>): void {
  const errorData = {
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    context,
    timestamp: new Date().toISOString()
  }

  console.error('Error:', JSON.stringify(errorData))

  // Could send to external error tracking service here
}
