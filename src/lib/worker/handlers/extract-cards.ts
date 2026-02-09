/**
 * Extract card patterns handler for worker API endpoint
 */

import type { Env } from '../../../worker.js'
import { errorResponse } from '../response.js'
import { extractCardPatterns, searchCardPattern } from '../patterns.js'

/**
 * Handle extract cards API endpoint
 * @param request - The incoming request
 * @param env - The environment variables
 * @returns Response with extracted card patterns and search results
 */
export async function handleExtractCards(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { text?: string }

    if (!body || !body.text) {
      return errorResponse('Missing text parameter', 400, 'MISSING_TEXT')
    }

    const text = body.text

    if (text.length > 10000) {
      return errorResponse('Text too long (max 10000 characters)', 400, 'TEXT_TOO_LONG', [`Text length: ${text.length}`])
    }

    // Extract patterns
    const patterns = extractCardPatterns(text)

    if (patterns.length === 0) {
      return Response.json({
        matches: [],
        total: 0
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Search all patterns in parallel
    const searchPromises = patterns.map(pattern => searchCardPattern(pattern, env))
    const searchResults = await Promise.all(searchPromises)

    // Build response
    const matches = patterns.map((pattern, index) => ({
      pattern: pattern.pattern,
      type: pattern.type,
      query: pattern.query,
      results: searchResults[index]
    }))

    return Response.json({
      matches,
      total: matches.length
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (e) {
    console.error('Extract cards error:', e)
    return errorResponse('Internal server error', 500)
  }
}
