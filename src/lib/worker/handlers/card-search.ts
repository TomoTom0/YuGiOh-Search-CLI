/**
 * Card search handler for worker API endpoint
 */

import type { Env } from '../../../worker.js'
import { errorResponse, jsonResponse } from '../response.js'
import { logError } from '../logging.js'
import { MAX_LIMIT, validateSearchParams, validateSortParam } from '../validation.js'
import { parseFilterParams, buildWhereClause } from '../filters.js'
import { normalizeForSearch } from '../../shared/normalizer.js'
import { matchParsedQuery } from '../../shared/search-parser.js'
import { mapCardDbToApi } from '../database.js'

/**
 * Handle card search API endpoint
 * @param request - The incoming request
 * @param url - The request URL
 * @param env - The environment variables
 * @returns Response with search results
 */
export async function handleCardSearch(request: Request, url: URL, env: Env): Promise<Response> {
  const limit = parseInt(url.searchParams.get('limit') || '10', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  const mode = url.searchParams.get('mode') || 'exact'
  const flagAutoModify = url.searchParams.get('auto_modify') !== 'false'
  const flagAllowWild = url.searchParams.get('allow_wild') !== 'false'
  const includeRuby = url.searchParams.get('include_ruby') !== 'false'
  const sort = url.searchParams.get('sort') || undefined

  // Parse filter parameters
  const filter = parseFilterParams(url.searchParams)

  // Support legacy 'q' parameter for backward compatibility
  const legacyQuery = url.searchParams.get('q')
  if (legacyQuery && !filter.name) {
    filter.name = { op: 'and', cond: [legacyQuery] }
  }

  if (Object.keys(filter).length === 0) {
    return errorResponse('Missing filter parameters', 400, 'MISSING_FILTER')
  }

  // Validate parameters
  const validationErrors = validateSearchParams(limit, offset, mode)
  if (validationErrors.length > 0) {
    return errorResponse('Invalid parameters', 400, 'VALIDATION_ERROR', validationErrors)
  }

  // Validate sort parameter
  let sortField: string | undefined
  let sortOrder: 'ASC' | 'DESC' = 'ASC'

  if (sort) {
    const sortResult = validateSortParam(sort)
    if (sortResult.error) {
      return errorResponse(sortResult.error, 400, 'INVALID_SORT_FIELD')
    }
    sortField = sortResult.sortField
    sortOrder = sortResult.sortOrder!
  }

  try {
    const [whereClause, bindParams, parsedTextQuery] = buildWhereClause(filter, mode, flagAutoModify, flagAllowWild, includeRuby)

    // Select commonly used columns only (avoid SELECT *)
    const selectCols = 'card_id, name, ruby, normalized_name, card_type, attribute, level, atk, def, description, race, monster_types, spell_effect_type, trap_effect_type, link_markers, link_value'

    // If we have parsed text query with negative/regex/phrase filters, fetch more results for post-processing
    const needsPostProcessing = parsedTextQuery && (
      parsedTextQuery.negative.length > 0 ||
      parsedTextQuery.regexes.length > 0 ||
      parsedTextQuery.phrases.length > 0
    )

    const fetchLimit = needsPostProcessing ? Math.min(limit * 3, MAX_LIMIT) : limit

    // Build ORDER BY clause
    const orderByClause = sortField ? ` ORDER BY ${sortField} ${sortOrder}` : ''
    const sqlQuery = `SELECT ${selectCols} FROM cards WHERE ${whereClause}${orderByClause} LIMIT ? OFFSET ?`
    bindParams.push(fetchLimit, offset)

    const result = await env.DB.prepare(sqlQuery).bind(...bindParams).all()
    let results = result.results || []

    // Apply post-processing filter if needed
    if (parsedTextQuery && results.length > 0) {
      results = results.filter((row: any) => {
        const text = flagAutoModify ? normalizeForSearch(row.description || '') : (row.description || '')
        return matchParsedQuery(text, parsedTextQuery!)
      })

      // Apply original limit after filtering
      results = results.slice(0, limit)
    }

    return jsonResponse({
      data: results.map(mapCardDbToApi),
      filter,
      limit,
      offset,
      total: results.length
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    logError(env, e instanceof Error ? e : String(e), {
      endpoint: '/api/cards/search',
      filter,
      mode,
      limit,
      offset
    })
    return errorResponse('Internal server error', 500, 'DB_ERROR', [errorMessage])
  }
}
