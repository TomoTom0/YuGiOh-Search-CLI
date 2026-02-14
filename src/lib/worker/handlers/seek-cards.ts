/**
 * Seek cards handler for worker API endpoint
 */

import type { Env } from '../../../worker.js'
import { errorResponse, jsonResponse } from '../response.js'
import { MAX_LIMIT } from '../validation.js'
import { mapCardDbToApi } from '../database.js'

/**
 * Handle seek cards API endpoint
 * @param request - The incoming request
 * @param url - The request URL
 * @param env - The environment variables
 * @returns Response with cards data
 */
export async function handleSeekCards(request: Request, url: URL, env: Env): Promise<Response> {
  const max = parseInt(url.searchParams.get('max') || '10', 10)
  const random = url.searchParams.get('random') !== 'false'
  const rangeStart = url.searchParams.get('range_start')
  const rangeEnd = url.searchParams.get('range_end')
  const all = url.searchParams.get('all') === 'true'
  const colsParam = url.searchParams.get('cols')
  const colAll = url.searchParams.get('colAll') === 'true'

  if (max > MAX_LIMIT || max < 1) {
    return errorResponse(`Max must be between 1 and ${MAX_LIMIT}`, 400)
  }

  if (all && (!rangeStart || !rangeEnd)) {
    return errorResponse('all parameter requires range_start and range_end', 400)
  }

  // Build column selection
  let selectCols: string
  if (colAll) {
    selectCols = '*'
  } else {
    const cols = colsParam ? colsParam.split(',').map(c => c.trim()) : ['card_id', 'name']
    selectCols = cols.join(', ')
  }

  // Build query
  let sqlQuery: string
  const bindParams: any[] = []

  if (rangeStart && rangeEnd) {
    // Range query
    if (all) {
      sqlQuery = `SELECT ${selectCols} FROM cards WHERE card_id BETWEEN ? AND ?`
      bindParams.push(rangeStart, rangeEnd)
    } else if (random) {
      sqlQuery = `SELECT ${selectCols} FROM cards WHERE card_id BETWEEN ? AND ? ORDER BY RANDOM() LIMIT ?`
      bindParams.push(rangeStart, rangeEnd, max)
    } else {
      sqlQuery = `SELECT ${selectCols} FROM cards WHERE card_id BETWEEN ? AND ? LIMIT ?`
      bindParams.push(rangeStart, rangeEnd, max)
    }
  } else {
    // No range specified
    if (random) {
      sqlQuery = `SELECT ${selectCols} FROM cards ORDER BY RANDOM() LIMIT ?`
      bindParams.push(max)
    } else {
      sqlQuery = `SELECT ${selectCols} FROM cards LIMIT ?`
      bindParams.push(max)
    }
  }

  try {
    const result = await env.DB.prepare(sqlQuery).bind(...bindParams).all()

    return jsonResponse({
      data: (result.results || []).map(mapCardDbToApi),
      total: result.results?.length || 0
    })
  } catch (e) {
    console.error('Seek cards error:', e)
    return errorResponse('Internal server error', 500)
  }
}
