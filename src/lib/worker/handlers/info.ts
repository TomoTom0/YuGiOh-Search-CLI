/**
 * Info handlers for basic data retrieval endpoints
 */

import type { Env } from '../../../worker.js'
import { errorResponse, jsonResponse } from '../response.js'
import { getCardById, getStats } from '../database.js'

/**
 * Handle card by ID endpoint
 * @param request - The incoming request
 * @param url - The request URL
 * @param env - The environment variables
 * @returns Response with card data
 */
export async function handleCardById(request: Request, url: URL, env: Env): Promise<Response> {
  const cardId = url.searchParams.get('id')

  if (!cardId) {
    return errorResponse('Missing id parameter', 400)
  }

  if (!/^\d+$/.test(cardId)) {
    return errorResponse('Invalid card ID format', 400)
  }

  try {
    const result = await getCardById(cardId, env)
    if (!result) {
      return errorResponse('Card not found', 404)
    }

    return jsonResponse(result)
  } catch (e) {
    console.error('Card by ID error:', e)
    return errorResponse('Internal server error', 500)
  }
}

/**
 * Handle stats endpoint
 * @param env - The environment variables
 * @returns Response with database statistics
 */
export async function handleStats(env: Env): Promise<Response> {
  try {
    const stats = await getStats(env)
    return jsonResponse(stats)
  } catch (e) {
    console.error('Stats error:', e)
    return errorResponse('Internal server error', 500)
  }
}
