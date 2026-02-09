/**
 * FAQ search handler for worker API endpoints
 */

import type { Env } from '../../../worker.js'
import { errorResponse, jsonResponse } from '../response.js'
import { MAX_LIMIT, MAX_OFFSET } from '../validation.js'
import { normalizeForSearch } from '../../shared/normalizer.js'

/**
 * Handle FAQ search API endpoint
 * @param request - The incoming request
 * @param url - The request URL
 * @param env - The environment variables
 * @returns Response with FAQ search results
 */
export async function handleFAQSearch(request: Request, url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get('q')
  const limit = parseInt(url.searchParams.get('limit') || '10', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)

  if (!query) {
    return errorResponse('Missing query parameter', 400)
  }

  if (limit > MAX_LIMIT || limit < 1) {
    return errorResponse(`Limit must be between 1 and ${MAX_LIMIT}`, 400)
  }

  if (offset > MAX_OFFSET || offset < 0) {
    return errorResponse(`Offset must be between 0 and ${MAX_OFFSET}`, 400)
  }

  try {
    const normalizedQuery = normalizeForSearch(query)

    const result = await env.DB.prepare(
      'SELECT * FROM faqs WHERE normalized_question LIKE ? OR normalized_answer LIKE ? LIMIT ? OFFSET ?'
    ).bind(`%${normalizedQuery}%`, `%${normalizedQuery}%`, limit, offset).all()

    return jsonResponse({
      data: result.results || [],
      query,
      limit,
      offset,
      total: result.results?.length || 0
    })
  } catch (e) {
    console.error('FAQ search error:', e)
    return errorResponse('Internal server error', 500)
  }
}
