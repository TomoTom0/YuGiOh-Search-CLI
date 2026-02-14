/**
 * Bulk search handler for worker API endpoint
 */

import type { Env } from '../../../worker.js'
import { errorResponse } from '../response.js'
import { MAX_LIMIT, MAX_OFFSET, MAX_BULK_QUERIES } from '../validation.js'
import type { NormalizedFilter } from '../filters.js'
import { buildWhereClause } from '../filters.js'
import { mapCardDbToApi } from '../database.js'

/**
 * Handle bulk search API endpoint
 * @param request - The incoming request
 * @param env - The environment variables
 * @returns Response with bulk search results
 */
export async function handleBulkSearch(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as {
      queries?: Array<{
        filter: Record<string, any>
        mode?: 'exact' | 'partial'
        limit?: number
        offset?: number
        auto_modify?: boolean
        allow_wild?: boolean
        include_ruby?: boolean
      }>
    }

    if (!body || !body.queries || !Array.isArray(body.queries)) {
      return errorResponse('Missing queries parameter', 400)
    }

    if (body.queries.length === 0) {
      return Response.json({
        results: []
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    if (body.queries.length > MAX_BULK_QUERIES) {
      return errorResponse(`Too many queries (max ${MAX_BULK_QUERIES})`, 400)
    }

    // Execute all queries in parallel
    const searchPromises = body.queries.map(async (queryDef, index) => {
      try {
        const filter: Record<string, NormalizedFilter> = {}

        // Normalize filter
        for (const k of Object.keys(queryDef.filter)) {
          const v = queryDef.filter[k]
          if (v && typeof v === 'object' && (v.op || Array.isArray(v.cond) || v.cond)) {
            const op = v.op === 'or' ? 'or' : 'and'
            const cond = Array.isArray(v.cond) ? v.cond : (v.cond !== undefined ? [v.cond] : [])
            filter[k] = { op, cond }
          } else if (Array.isArray(v)) {
            filter[k] = { op: 'or', cond: v }
          } else {
            filter[k] = { op: 'and', cond: [v] }
          }
        }

        const mode = queryDef.mode || 'exact'
        const limit = Math.min(queryDef.limit || 10, MAX_LIMIT)
        const offset = Math.min(queryDef.offset || 0, MAX_OFFSET)
        const flagAutoModify = queryDef.auto_modify !== false
        const flagAllowWild = queryDef.allow_wild !== false
        const includeRuby = queryDef.include_ruby !== false

        const [whereClause, bindParams] = buildWhereClause(filter, mode, flagAutoModify, flagAllowWild, includeRuby)

        // Select commonly used columns only (avoid SELECT *)
        const selectCols = 'card_id, name, ruby, normalized_name, card_type, attribute, level, atk, def, description, race, monster_types, spell_effect_type, trap_effect_type, link_markers, link_value'
        const sqlQuery = `SELECT ${selectCols} FROM cards WHERE ${whereClause} LIMIT ${limit} OFFSET ${offset}`
        bindParams.push(limit, offset)

        const result = await env.DB.prepare(sqlQuery).bind(...bindParams).all()

        return {
          query: index,
          data: (result.results || []).map(mapCardDbToApi),
          total: result.results?.length || 0
        }
      } catch (e) {
        console.error(`Bulk query ${index} error:`, e)
        return {
          query: index,
          error: 'Query execution failed',
          data: [],
          total: 0
        }
      }
    })

    const results = await Promise.all(searchPromises)

    return Response.json({
      results
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (e) {
    console.error('Bulk search error:', e)
    return errorResponse('Internal server error', 500)
  }
}
