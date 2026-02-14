/**
 * Semantic search handlers for worker API endpoints
 */

import type { Env } from '../../../worker.js'
import { errorResponse, jsonResponse } from '../response.js'
import { MAX_LIMIT } from '../validation.js'
import { embedTextWithAzure } from '../embeddings.js'
import { mapCardDbToApi } from '../database.js'

/**
 * Handle semantic card search API endpoint
 * @param request - The incoming request
 * @param url - The request URL
 * @param env - The environment variables
 * @returns Response with semantic search results
 */
export async function handleSemanticCardSearch(request: Request, url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get('q')
  const limit = parseInt(url.searchParams.get('limit') || '10', 10)

  if (!query) {
    return errorResponse('Missing query parameter', 400)
  }

  if (query.length > 500) {
    return errorResponse('Query too long', 400)
  }

  if (limit > MAX_LIMIT || limit < 1) {
    return errorResponse(`Limit must be between 1 and ${MAX_LIMIT}`, 400)
  }

  if (!env.VECTORIZER) {
    return errorResponse('Vectorize not configured', 503)
  }

  try {
    const embedding = await embedTextWithAzure(query, env)
    const results = await env.VECTORIZER.query(embedding, {
      topK: limit
    })

    const cardIds = results.matches?.map(m => m.id.replace(/^card_/, '').replace(/^faq_/, '')) || []
    if (cardIds.length === 0) {
      console.log('No matches from Vectorize. Results:', JSON.stringify(results))
      return jsonResponse({ data: [], query, limit, total: 0, debug: { matchCount: results.matches?.length || 0 } })
    }

    const placeholders = cardIds.map(() => '?').join(',')
    const cards = await env.DB.prepare(
      `SELECT card_id, name, description, card_type, attribute, level, atk, def FROM cards WHERE card_id IN (${placeholders})`
    ).bind(...cardIds).all() as { results: any[] }

    return jsonResponse({
      data: cards.results.map(mapCardDbToApi),
      query,
      limit,
      total: cards.results.length,
      scores: results.matches?.map(m => m.score)
    })
  } catch (e) {
    console.error('Semantic card search error:', e)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * Handle semantic FAQ search API endpoint
 * @param request - The incoming request
 * @param url - The request URL
 * @param env - The environment variables
 * @returns Response with semantic FAQ search results
 */
export async function handleSemanticFAQSearch(request: Request, url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get('q')
  const limit = parseInt(url.searchParams.get('limit') || '10', 10)

  if (!query) {
    return errorResponse('Missing query parameter', 400)
  }

  if (query.length > 500) {
    return errorResponse('Query too long', 400)
  }

  if (limit > MAX_LIMIT || limit < 1) {
    return errorResponse(`Limit must be between 1 and ${MAX_LIMIT}`, 400)
  }

  if (!env.VECTORIZER) {
    return errorResponse('Vectorize not configured', 503)
  }

  try {
    const embedding = await embedTextWithAzure(query, env)
    const results = await env.VECTORIZER.query(embedding, {
      topK: limit,
      filter: { type: 'faq' }
    })

    const faqIds = results.matches?.map(m => m.id.replace(/^faq_/, '')) || []
    if (faqIds.length === 0) {
      return jsonResponse({ data: [], query, limit, total: 0 })
    }

    const placeholders = faqIds.map(() => '?').join(',')
    const faqs = await env.DB.prepare(
      `SELECT faq_id, question, answer FROM faqs WHERE faq_id IN (${placeholders})`
    ).bind(...faqIds).all() as { results: any[] }

    return jsonResponse({
      data: faqs.results,
      query,
      limit,
      total: faqs.results.length,
      scores: results.matches?.map(m => m.score)
    })
  } catch (e) {
    console.error('Semantic FAQ search error:', e)
    return errorResponse('Internal server error', 500)
  }
}
