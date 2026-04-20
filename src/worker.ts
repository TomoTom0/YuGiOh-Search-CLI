/**
 * Cloudflare Worker for YGO Search API
 */

import type { D1Database, AnalyticsEngineDataset, VectorizeIndex, R2Bucket, Ai, ExecutionContext } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  ANALYTICS?: AnalyticsEngineDataset
  VECTORIZER?: VectorizeIndex
  R2_BUCKET?: R2Bucket
  AI?: Ai
  AZURE_API_KEY?: string
  AZURE_MODEL?: string
  AZURE_ENDPOINT?: string
  API_SECRET?: string
}

// Import all worker utilities and handlers
import {
  checkAuth,
  checkScope,
  SCOPES,
  errorResponse,
  jsonResponse,
  logRequest,
  handleCardSearch,
  handleFAQSearch,
  handleSemanticCardSearch,
  handleSemanticFAQSearch,
  handleVectorizeCards,
  handleVectorizeFAQs,
  handleVectorSetup,
  handleVectorSetupGeneric,
  handleExtractCards,
  handleReplaceCards,
  handleSeekCards,
  handleBulkSearch,
  handleUpdate,
  handleDocs,
  handleConvert,
  handleCardById,
  handleStats
} from './lib/worker/index.js'
import {
  handleCreateApiKey,
  handleListApiKeys,
  handleDeleteApiKey,
  handleGetApiLogs
} from './lib/worker/handlers/api-keys.js'
import { logApiRequest } from './lib/worker/audit-log.js'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const startTime = Date.now()
    const url = new URL(request.url)
    // Normalize path: remove trailing slash except for root
    const path = url.pathname === '/' ? '/' : url.pathname.replace(/\/$/, '')

    // Health check
    if (path === '/health') {
      const duration = Date.now() - startTime
      logRequest(env, request, 200, duration, 'health_check')
      return Response.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
      })
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      const duration = Date.now() - startTime
      logRequest(env, request, 204, duration, 'cors_preflight')
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-Secret, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      })
    }

    // Authentication check (skip only for /api/docs)
    let authResult: Awaited<ReturnType<typeof checkAuth>> | null = null
    if (path !== '/api/docs') {
      authResult = await checkAuth(request, env)
      if (!authResult.authorized) {
        const duration = Date.now() - startTime
        logRequest(env, request, 401, duration, 'unauthorized')
        return authResult.response!
      }
    }

    let response: Response

    if (path === '/api/cards/search') {
      const scopeError = checkScope(authResult!, SCOPES.CARDS_READ)
      if (scopeError) return scopeError
      response = await handleCardSearch(request, url, env)
    } else if (path === '/api/faqs/search') {
      const scopeError = checkScope(authResult!, SCOPES.FAQS_READ)
      if (scopeError) return scopeError
      response = await handleFAQSearch(request, url, env)
    } else if (path === '/api/cards/by-id') {
      const scopeError = checkScope(authResult!, SCOPES.CARDS_READ)
      if (scopeError) return scopeError
      response = await handleCardById(request, url, env)
    } else if (path === '/api/stats') {
      const scopeError = checkScope(authResult!, SCOPES.STATS_READ)
      if (scopeError) return scopeError
      response = await handleStats(env)
    } else if (path === '/api/cards/semantic-search') {
      const scopeError = checkScope(authResult!, SCOPES.CARDS_READ)
      if (scopeError) return scopeError
      response = await handleSemanticCardSearch(request, url, env)
    } else if (path === '/api/faqs/semantic-search') {
      const scopeError = checkScope(authResult!, SCOPES.FAQS_READ)
      if (scopeError) return scopeError
      response = await handleSemanticFAQSearch(request, url, env)
    } else if (path === '/api/vectorize/cards') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      const scopeError = checkScope(authResult!, SCOPES.VECTORIZE)
      if (scopeError) return scopeError
      response = await handleVectorizeCards(env)
    } else if (path === '/api/vectorize/faqs') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      const scopeError = checkScope(authResult!, SCOPES.VECTORIZE)
      if (scopeError) return scopeError
      response = await handleVectorizeFAQs(env)
    } else if (path === '/api/cards/extract') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      const scopeError = checkScope(authResult!, SCOPES.CARDS_READ)
      if (scopeError) return scopeError
      response = await handleExtractCards(request, env)
    } else if (path === '/api/cards/replace') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      const scopeError = checkScope(authResult!, SCOPES.CARDS_READ)
      if (scopeError) return scopeError
      response = await handleReplaceCards(request, env)
    } else if (path === '/api/cards/seek') {
      const scopeError = checkScope(authResult!, SCOPES.CARDS_READ)
      if (scopeError) return scopeError
      response = await handleSeekCards(request, url, env)
    } else if (path === '/api/cards/bulk') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      const scopeError = checkScope(authResult!, SCOPES.CARDS_READ)
      if (scopeError) return scopeError
      response = await handleBulkSearch(request, env)
    } else if (path === '/api/docs') {
      response = await handleDocs(request, url, env)
    } else if (path === '/api/convert') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      const scopeError = checkScope(authResult!, SCOPES.CONVERT)
      if (scopeError) return scopeError
      response = await handleConvert(request, env)
    } else if (path === '/api/vector/setup') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      const scopeError = checkScope(authResult!, SCOPES.VECTORIZE)
      if (scopeError) return scopeError
      response = await handleVectorSetup(request, env)
    } else if (path === '/api/vector/setup-generic') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      const scopeError = checkScope(authResult!, SCOPES.VECTORIZE)
      if (scopeError) return scopeError
      response = await handleVectorSetupGeneric(request, env)
    } else if (path === '/api/update') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      const scopeError = checkScope(authResult!, SCOPES.ADMIN)
      if (scopeError) return scopeError
      response = await handleUpdate(request, env)
    } else if (path === '/api/keys') {
      if (!authResult) {
        return errorResponse('Unauthorized', 401)
      }
      if (request.method === 'POST') {
        response = await handleCreateApiKey(request, env, authResult)
      } else if (request.method === 'GET') {
        response = await handleListApiKeys(request, env, authResult)
      } else {
        return errorResponse('Method not allowed', 405)
      }
    } else if (path === '/api/keys/logs') {
      if (!authResult) {
        return errorResponse('Unauthorized', 401)
      }
      if (request.method === 'GET') {
        response = await handleGetApiLogs(request, env, authResult)
      } else {
        return errorResponse('Method not allowed', 405)
      }
    } else if (path.startsWith('/api/keys/') && path.split('/').length === 4) {
      // DELETE /api/keys/:id
      if (!authResult) {
        return errorResponse('Unauthorized', 401)
      }
      const keyId = path.split('/')[3]
      if (request.method === 'DELETE') {
        response = await handleDeleteApiKey(request, env, authResult, keyId)
      } else {
        return errorResponse('Method not allowed', 405)
      }
    } else {
      response = errorResponse('Endpoint not found', 404, 'NOT_FOUND', [
        'API documentation: GET /api/docs?list',
        'See all available endpoints at /api/docs'
      ])
    }

    const duration = Date.now() - startTime
    logRequest(env, request, response.status, duration, path.substring(1))

    ctx.waitUntil(logApiRequest(env, request, authResult, response.status))

    return response
  }
}
