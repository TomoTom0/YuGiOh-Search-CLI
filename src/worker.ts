/**
 * Cloudflare Worker for YGO Search API
 */

import type { D1Database, AnalyticsEngineDataset, VectorizeIndex, R2Bucket, Ai } from '@cloudflare/workers-types'

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
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
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-API-Secret, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      })
    }

    // Authentication check (skip only for /api/docs)
    if (path !== '/api/docs') {
      const authResult = checkAuth(request, env)
      if (!authResult.authorized) {
        const duration = Date.now() - startTime
        logRequest(env, request, 401, duration, 'unauthorized')
        return authResult.response!
      }
    }

    let response: Response

    if (path === '/api/cards/search') {
      response = await handleCardSearch(request, url, env)
    } else if (path === '/api/faqs/search') {
      response = await handleFAQSearch(request, url, env)
    } else if (path === '/api/cards/by-id') {
      response = await handleCardById(request, url, env)
    } else if (path === '/api/stats') {
      response = await handleStats(env)
    } else if (path === '/api/cards/semantic-search') {
      response = await handleSemanticCardSearch(request, url, env)
    } else if (path === '/api/faqs/semantic-search') {
      response = await handleSemanticFAQSearch(request, url, env)
    } else if (path === '/api/vectorize/cards') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      response = await handleVectorizeCards(env)
    } else if (path === '/api/vectorize/faqs') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      response = await handleVectorizeFAQs(env)
    } else if (path === '/api/cards/extract') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      response = await handleExtractCards(request, env)
    } else if (path === '/api/cards/replace') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      response = await handleReplaceCards(request, env)
    } else if (path === '/api/cards/seek') {
      response = await handleSeekCards(request, url, env)
    } else if (path === '/api/cards/bulk') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      response = await handleBulkSearch(request, env)
    } else if (path === '/api/docs') {
      response = await handleDocs(request, url, env)
    } else if (path === '/api/convert') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      response = await handleConvert(request, env)
    } else if (path === '/api/vector/setup') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      response = await handleVectorSetup(request, env)
    } else if (path === '/api/vector/setup-generic') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      response = await handleVectorSetupGeneric(request, env)
    } else if (path === '/api/update') {
      if (request.method !== 'POST') {
        return errorResponse('Method not allowed', 405)
      }
      response = await handleUpdate(request, env)
    } else {
      response = errorResponse('Endpoint not found', 404, 'NOT_FOUND', [
        'API documentation: GET /api/docs?list',
        'See all available endpoints at /api/docs'
      ])
    }

    const duration = Date.now() - startTime
    logRequest(env, request, response.status, duration, path.substring(1))

    return response
  }
}
