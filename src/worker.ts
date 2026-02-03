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

const MAX_LIMIT = 100
const MAX_OFFSET = 1000
const MAX_BULK_QUERIES = 50 // Maximum number of queries in bulk request

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

function logRequest(env: Env, request: Request, status: number, duration: number, path: string): void {
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

function logError(env: Env, error: Error | string, context: Record<string, any>): void {
  const errorData = {
    error: error instanceof Error ? error.message : error,
    stack: error instanceof Error ? error.stack : undefined,
    context,
    timestamp: new Date().toISOString()
  }

  console.error('Error:', JSON.stringify(errorData))

  // Could send to external error tracking service here
}

interface ErrorResponse {
  error: string
  code?: string
  details?: string[]
  timestamp: string
}

function errorResponse(
  message: string,
  status: number,
  codeOrHeaders?: string | Record<string, string>,
  details?: string[],
  extraHeaders?: Record<string, string>
): Response {
  const errorObj: ErrorResponse = {
    error: message,
    timestamp: new Date().toISOString()
  }

  // Handle backward compatibility: if third arg is object, treat as headers
  let code: string | undefined
  let headers: Record<string, string> = {}

  if (typeof codeOrHeaders === 'string') {
    code = codeOrHeaders
    headers = extraHeaders || {}
  } else if (codeOrHeaders) {
    headers = codeOrHeaders
  }

  if (code) {
    errorObj.code = code
  }

  if (details && details.length > 0) {
    errorObj.details = details
  }

  return Response.json(errorObj, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...headers
    }
  })
}

/**
 * Validate request parameters
 */
function validateSearchParams(limit: number, offset: number, mode: string): string[] {
  const errors: string[] = []

  if (limit > MAX_LIMIT || limit < 1) {
    errors.push(`limit must be between 1 and ${MAX_LIMIT}`)
  }

  if (offset > MAX_OFFSET || offset < 0) {
    errors.push(`offset must be between 0 and ${MAX_OFFSET}`)
  }

  if (mode !== 'exact' && mode !== 'partial') {
    errors.push('mode must be "exact" or "partial"')
  }

  return errors
}

/**
 * Check API authentication
 */
function checkAuth(request: Request, env: Env): { authorized: boolean; response?: Response } {
  const apiSecret = request.headers.get('X-API-Secret') || request.headers.get('Authorization')?.replace('Bearer ', '')

  if (!apiSecret || apiSecret !== env.API_SECRET) {
    return {
      authorized: false,
      response: errorResponse('Unauthorized - API token required', 401, 'UNAUTHORIZED', [
        'Include X-API-Secret header with your API token',
        'Example: curl -H "X-API-Secret: your-token" https://...',
        'API documentation: /api/docs'
      ])
    }
  }

  return { authorized: true }
}

function normalizeForSearch(str: string): string {
  if (!str) return ''
  return str
    .replace(/[\s\u3000]+/g, '')
    .replace(/[・★☆※‼！？。、,.，．:：;；「」『』【】〔〕（）()［］\[\]｛｝{}〈〉《》〜～~\-－_＿\/／\\＼|｜&＆@＠#＃$＄%％^＾*＊+＋=＝<＜>＞'"\"'""''`´｀]/g, '')
    .replace(/竜/g, '龍')
    .replace(/剣/g, '劍')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (s) => String.fromCharCode(s.charCodeAt(0) + 0x60))
}

/**
 * Parsed search query interface
 */
interface ParsedSearchQuery {
  positive: string[]
  negative: string[]
  phrases: string[]
  regexes: string[]
}

/**
 * Parse search query with support for:
 * - Negative search: -word or -"phrase"
 * - Phrase search: "phrase"
 * - Regex search: reg:pattern or reg:"pattern"
 */
function parseSearchQuery(query: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    positive: [],
    negative: [],
    phrases: [],
    regexes: []
  }

  if (!query || !query.trim()) {
    return result
  }

  const matched: Array<{ start: number; end: number }> = []

  // 1. Extract regex patterns (reg:pattern or reg:"pattern")
  const regexPattern = /reg:(?:"([^"]+)"|(\S+))/g
  let match: RegExpExecArray | null
  while ((match = regexPattern.exec(query)) !== null) {
    const pattern = match[1] || match[2]
    result.regexes.push(pattern)
    matched.push({ start: match.index, end: match.index + match[0].length })
  }

  // 2. Extract negative search (-word or -"phrase")
  const negativePattern = /-(?:"([^"]+)"|(\S+))/g
  while ((match = negativePattern.exec(query)) !== null) {
    const word = match[1] || match[2]
    result.negative.push(word)
    matched.push({ start: match.index, end: match.index + match[0].length })
  }

  // 3. Extract phrase search ("phrase")
  const phrasePattern = /"([^"]+)"/g
  while ((match = phrasePattern.exec(query)) !== null) {
    const isOverlapping = matched.some(m =>
      (match!.index >= m.start && match!.index < m.end) ||
      (match!.index + match![0].length > m.start && match!.index + match![0].length <= m.end)
    )

    if (!isOverlapping) {
      const phrase = match[1]
      result.phrases.push(phrase)
      matched.push({ start: match.index, end: match.index + match[0].length })
    }
  }

  // 4. Extract remaining words as positive search
  let remaining = ''
  let lastEnd = 0

  matched.sort((a, b) => a.start - b.start)

  for (const m of matched) {
    remaining += query.substring(lastEnd, m.start) + ' '
    lastEnd = m.end
  }
  remaining += query.substring(lastEnd)

  const words = remaining.split(/\s+/).filter(w => w.trim() && w !== '-' && !w.startsWith('reg:'))
  result.positive = words

  return result
}

/**
 * Check if text matches parsed query
 */
function matchParsedQuery(text: string, parsed: ParsedSearchQuery): boolean {
  if (!text) return false

  // Check negative search (exclude if any match)
  for (const negWord of parsed.negative) {
    if (text.includes(negWord)) {
      return false
    }
  }

  // Check regex patterns (all must match)
  for (const regexStr of parsed.regexes) {
    try {
      const regex = new RegExp(regexStr)
      if (!regex.test(text)) {
        return false
      }
    } catch (e) {
      console.warn(`Invalid regex pattern: ${regexStr}`, e)
      return false
    }
  }

  // Check phrase search (all must match)
  for (const phrase of parsed.phrases) {
    if (!text.includes(phrase)) {
      return false
    }
  }

  // Check positive words (all must match)
  for (const word of parsed.positive) {
    if (!text.includes(word)) {
      return false
    }
  }

  return true
}

function valueMatches(
  fieldValue: string,
  cond: string,
  mode: string,
  flagAutoModify: boolean,
  isNameField: boolean,
  normalizedVal: string | undefined,
  flagAllowWild: boolean,
  isTextField: boolean
): boolean {
  if (cond === '' || cond === null || cond === undefined) {
    return fieldValue === '' || fieldValue === null || fieldValue === undefined
  }

  const hasWildcard = flagAllowWild && String(cond).includes('*')

  let searchTarget = flagAutoModify ? (normalizedVal !== undefined ? normalizedVal : normalizeForSearch(fieldValue)) : fieldValue
  let searchPattern = String(cond)

  if (hasWildcard && flagAutoModify) {
    const parts = searchPattern.split('*')
    searchPattern = parts.map(p => normalizeForSearch(p)).join('*')
  } else if (flagAutoModify) {
    searchPattern = normalizeForSearch(searchPattern)
  }

  if (isTextField && String(cond).includes('-"')) {
    const negativeMatches = String(cond).match(/-["'`]([^"'`]+)["'`]/g)
    if (negativeMatches) {
      for (const negMatch of negativeMatches) {
        const phrase = negMatch.slice(2, -1)
        const normalizedPhrase = flagAutoModify ? normalizeForSearch(phrase) : phrase
        if (searchTarget.includes(normalizedPhrase)) {
          return false
        }
      }
      searchPattern = String(cond).replace(/-["'`][^"'`]+["'`]/g, '').trim()
      if (!searchPattern) return true
      if (hasWildcard && flagAutoModify) {
        const parts = searchPattern.split('*')
        searchPattern = parts.map(p => normalizeForSearch(p)).join('*')
      } else if (flagAutoModify) {
        searchPattern = normalizeForSearch(searchPattern)
      }
    }
  }

  if (mode === 'partial') {
    return searchTarget.includes(searchPattern)
  }

  if (hasWildcard) {
    const regexPattern = searchPattern.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')
    const regex = new RegExp(`^${regexPattern}$`, 'i')
    return regex.test(searchTarget)
  }

  return searchTarget === searchPattern
}

interface NormalizedFilter {
  op: 'and' | 'or'
  cond: any[]
}

/**
 * Parse filter parameters from URL search params
 * Supports both simple and complex filter formats:
 * - Simple: ?filter[name]=value
 * - OR condition: ?filter[name][or][]=value1&filter[name][or][]=value2
 * - AND condition: ?filter[name][and][]=value1&filter[name][and][]=value2
 */
function parseFilterParams(searchParams: URLSearchParams): Record<string, NormalizedFilter> {
  const filter: Record<string, NormalizedFilter> = {}
  const processed = new Set<string>()

  for (const [key, value] of searchParams.entries()) {
    // Match filter[field], filter[field][op][], filter[field][cond]
    const simpleMatch = key.match(/^filter\[([^\]]+)\]$/)
    const complexMatch = key.match(/^filter\[([^\]]+)\]\[([^\]]+)\](?:\[\])?$/)

    if (simpleMatch) {
      const field = simpleMatch[1]
      if (!processed.has(field)) {
        filter[field] = { op: 'and', cond: [value] }
        processed.add(field)
      }
    } else if (complexMatch) {
      const field = complexMatch[1]
      const opOrKey = complexMatch[2]

      if (opOrKey === 'or' || opOrKey === 'and') {
        const op = opOrKey
        if (!filter[field]) {
          filter[field] = { op, cond: [] }
          processed.add(field)
        }
        filter[field].cond.push(value)
      } else if (opOrKey === 'cond') {
        if (!filter[field]) {
          filter[field] = { op: 'and', cond: [] }
          processed.add(field)
        }
        filter[field].cond.push(value)
      }
    }
  }

  return filter
}

/**
 * Build SQL WHERE clause from normalized filter
 * Returns [whereClause, bindParams, parsedTextQueries]
 */
function buildWhereClause(
  filter: Record<string, NormalizedFilter>,
  mode: string,
  flagAutoModify: boolean,
  flagAllowWild: boolean,
  includeRuby: boolean
): [string, any[], ParsedSearchQuery | null] {
  const whereClauses: string[] = []
  const bindParams: any[] = []
  let parsedTextQuery: ParsedSearchQuery | null = null

  for (const [field, f] of Object.entries(filter)) {
    if (!f || f.cond.length === 0) continue

    const fieldClauses: string[] = []

    // Special handling for 'text' field with search-parser
    if (field === 'text' || field === 'description') {
      for (const condValue of f.cond) {
        const parsed = parseSearchQuery(String(condValue))

        // Store parsed query for post-processing
        if (field === 'text') {
          parsedTextQuery = parsed
        }

        // Use only positive words for SQL WHERE clause (for efficient pre-filtering)
        const allWords = [...parsed.positive, ...parsed.phrases]

        if (allWords.length === 0 && parsed.regexes.length === 0 && parsed.negative.length === 0) {
          // If no specific terms, skip (will match all in post-processing)
          continue
        }

        if (allWords.length > 0) {
          // Build SQL conditions for positive words and phrases
          const wordClauses: string[] = []
          for (const word of allWords) {
            const searchPattern = flagAutoModify ? normalizeForSearch(word) : word
            const dbField = field === 'text' ? 'description' : field
            wordClauses.push(`${dbField} LIKE ?`)
            bindParams.push(`%${searchPattern}%`)
          }

          // Positive words use AND (all must match)
          fieldClauses.push(`(${wordClauses.join(' AND ')})`)
        } else if (parsed.negative.length > 0 || parsed.regexes.length > 0) {
          // If only negative/regex patterns, match all (filter in post-processing)
          // No WHERE clause needed, just ensure some results to filter
        }
      }
    } else {
      // Original logic for non-text fields
      for (const condValue of f.cond) {
        const useMode = field === 'name' ? mode : 'exact'
        const hasWildcard = flagAllowWild && String(condValue).includes('*')

        let searchPattern = String(condValue)
        if (flagAutoModify) {
          if (hasWildcard) {
            const parts = searchPattern.split('*')
            searchPattern = parts.map(p => normalizeForSearch(p)).join('*')
          } else {
            searchPattern = normalizeForSearch(searchPattern)
          }
        }

        // Use normalized_name for name field
        const dbField = field === 'name' ? 'normalized_name' : field

        // Build condition for the field
        let condition = ''
        if (hasWildcard) {
          const pattern = searchPattern.split('*').join('%')
          condition = `${dbField} LIKE ?`
          bindParams.push(pattern)
        } else if (useMode === 'partial') {
          condition = `${dbField} LIKE ?`
          bindParams.push(`%${searchPattern}%`)
        } else {
          condition = `${dbField} = ?`
          bindParams.push(searchPattern)
        }

        // If searching by name and includeRuby is true, also search normalized_ruby
        if (field === 'name' && includeRuby) {
          let rubyCondition = ''
          if (hasWildcard) {
            const pattern = searchPattern.split('*').join('%')
            rubyCondition = `normalized_ruby LIKE ?`
            bindParams.push(pattern)
          } else if (useMode === 'partial') {
            rubyCondition = `normalized_ruby LIKE ?`
            bindParams.push(`%${searchPattern}%`)
          } else {
            rubyCondition = `normalized_ruby = ?`
            bindParams.push(searchPattern)
          }
          // Combine name and ruby conditions with OR
          fieldClauses.push(`(${condition} OR ${rubyCondition})`)
        } else {
          fieldClauses.push(condition)
        }
      }
    }

    if (fieldClauses.length > 0) {
      const operator = f.op === 'or' ? ' OR ' : ' AND '
      whereClauses.push(`(${fieldClauses.join(operator)})`)
    }
  }

  if (whereClauses.length === 0) {
    return ['1=1', [], parsedTextQuery]
  }

  return [whereClauses.join(' AND '), bindParams, parsedTextQuery]
}

async function handleCardSearch(request: Request, url: URL, env: Env): Promise<Response> {
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
    const sortParts = sort.split(':')
    sortField = sortParts[0]
    sortOrder = (sortParts[1]?.toUpperCase() === 'DESC') ? 'DESC' : 'ASC'

    const validSortFields = ['card_id', 'name', 'ruby', 'atk', 'def', 'level', 'attribute', 'race', 'card_type']
    if (!validSortFields.includes(sortField)) {
      return errorResponse(`Invalid sort field "${sortField}". Valid fields: ${validSortFields.join(', ')}`, 400, 'INVALID_SORT_FIELD')
    }
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
        return matchParsedQuery(text, parsedTextQuery)
      })

      // Apply original limit after filtering
      results = results.slice(0, limit)
    }

    return jsonResponse({
      data: results,
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

async function handleFAQSearch(request: Request, url: URL, env: Env): Promise<Response> {
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

async function handleCardById(request: Request, url: URL, env: Env): Promise<Response> {
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

async function handleStats(env: Env): Promise<Response> {
  try {
    const stats = await getStats(env)
    return jsonResponse(stats)
  } catch (e) {
    console.error('Stats error:', e)
    return errorResponse('Internal server error', 500)
  }
}

function jsonResponse(data: any): Response {
  return Response.json(data, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

async function getCardById(cardId: string, env: Env) {
  const result = await env.DB.prepare(
    'SELECT * FROM cards WHERE card_id = ?'
  ).bind(cardId).first()

  return result
}

async function getStats(env: Env) {
  const [cardsCount, faqsCount] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM cards').first<{ count: number }>(),
    env.DB.prepare('SELECT COUNT(*) as count FROM faqs').first<{ count: number }>()
  ])

  return {
    cards: cardsCount?.count || 0,
    faqs: faqsCount?.count || 0,
    timestamp: new Date().toISOString()
  }
}

async function embedTextWithAzure(text: string, env: Env): Promise<number[]> {
  if (!env.AZURE_API_KEY || !env.AZURE_ENDPOINT || !env.AZURE_MODEL) {
    throw new Error('Azure OpenAI credentials not configured')
  }

  const url = `${env.AZURE_ENDPOINT}/openai/deployments/${env.AZURE_MODEL}/embeddings?api-version=2024-02-15-preview`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.AZURE_API_KEY
    },
    body: JSON.stringify({
      input: text
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Azure OpenAI API error: ${response.status} - ${error}`)
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> }
  return data.data[0].embedding
}

async function handleSemanticCardSearch(request: Request, url: URL, env: Env): Promise<Response> {
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
      data: cards.results,
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

async function handleSemanticFAQSearch(request: Request, url: URL, env: Env): Promise<Response> {
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

async function handleVectorizeCards(env: Env): Promise<Response> {
  if (!env.VECTORIZER) {
    return errorResponse('Vectorize not configured', 503)
  }

  if (!env.AZURE_API_KEY || !env.AZURE_ENDPOINT || !env.AZURE_MODEL) {
    return errorResponse('Azure OpenAI credentials not configured', 503)
  }

  try {
    const cards = await env.DB.prepare('SELECT card_id, name, description FROM cards').all()

    const batchSize = 10
    const vectors: Array<{ id: string; values: number[]; metadata: Record<string, string> }> = []

    for (let i = 0; i < cards.results.length; i += batchSize) {
      const batch = cards.results.slice(i, i + batchSize)

      const batchVectors = await Promise.all(
        batch.map(async (card: any) => {
          const text = `${card.name}\n${card.description}`
          const embedding = await embedTextWithAzure(text, env)
          return {
            id: card.card_id.toString(),
            values: embedding,
            metadata: {
              name: card.name,
              type: 'card'
            }
          }
        })
      )

      vectors.push(...batchVectors)

      if ((i + batch.length) % 100 === 0) {
        console.log(`Progress: ${i + batch.length}/${cards.results.length}`)
      }
    }

    await env.VECTORIZER.upsert(vectors)

    return Response.json({
      message: 'Card vectorization completed',
      total: vectors.length
    })
  } catch (e) {
    console.error('Vectorize cards error:', e)
    return errorResponse('Internal server error', 500)
  }
}

async function handleVectorizeFAQs(env: Env): Promise<Response> {
  if (!env.VECTORIZER) {
    return errorResponse('Vectorize not configured', 503)
  }

  if (!env.AZURE_API_KEY || !env.AZURE_ENDPOINT || !env.AZURE_MODEL) {
    return errorResponse('Azure OpenAI credentials not configured', 503)
  }

  try {
    const faqs = await env.DB.prepare('SELECT faq_id, question, answer FROM faqs').all()

    const batchSize = 10
    const vectors: Array<{ id: string; values: number[]; metadata: Record<string, string> }> = []

    for (let i = 0; i < faqs.results.length; i += batchSize) {
      const batch = faqs.results.slice(i, i + batchSize)

      const batchVectors = await Promise.all(
        batch.map(async (faq: any) => {
          const text = `Q: ${faq.question}\nA: ${faq.answer}`
          const embedding = await embedTextWithAzure(text, env)
          return {
            id: faq.faq_id.toString(),
            values: embedding,
            metadata: {
              question: faq.question.substring(0, 100),
              type: 'faq'
            }
          }
        })
      )

      vectors.push(...batchVectors)

      if ((i + batch.length) % 100 === 0) {
        console.log(`Progress: ${i + batch.length}/${faqs.results.length}`)
      }
    }

    await env.VECTORIZER.upsert(vectors)

    return Response.json({
      message: 'FAQ vectorization completed',
      total: vectors.length
    })
  } catch (e) {
    console.error('Vectorize FAQs error:', e)
    return errorResponse('Internal server error', 500)
  }
}

interface ExtractedPattern {
  pattern: string
  type: 'cardId' | 'exact' | 'flexible'
  query: string
  originalName?: string
}

/**
 * Extract card name patterns from text
 * Supports {card-name} (flexible), 《card-name》 (exact), and {{card-name|cardId}} (by ID)
 */
function extractCardPatterns(text: string): ExtractedPattern[] {
  const patterns: ExtractedPattern[] = []
  const usedPositions = new Set<number>()

  // Pattern 1: {{card-name|cid}} - already processed / cardId search
  const cardIdPattern = /\{\{([^|]+)\|([^}]+)\}\}/g
  let match: RegExpExecArray | null

  while ((match = cardIdPattern.exec(text)) !== null) {
    patterns.push({
      pattern: match[0],
      type: 'cardId',
      query: match[2].trim(),
      originalName: match[1].trim()
    })

    for (let i = match.index; i < match.index + match[0].length; i++) {
      usedPositions.add(i)
    }
  }

  // Pattern 2: 《card-name》 - exact name search
  const exactPattern = /《([^》]+)》/g
  while ((match = exactPattern.exec(text)) !== null) {
    if (usedPositions.has(match.index)) continue

    patterns.push({
      pattern: match[0],
      type: 'exact',
      query: match[1].trim()
    })

    for (let i = match.index; i < match.index + match[0].length; i++) {
      usedPositions.add(i)
    }
  }

  // Pattern 3: {card-name} - flexible name search
  const flexiblePattern = /\{([^}]+)\}/g
  while ((match = flexiblePattern.exec(text)) !== null) {
    if (usedPositions.has(match.index)) continue

    patterns.push({
      pattern: match[0],
      type: 'flexible',
      query: match[1].trim()
    })

    for (let i = match.index; i < match.index + match[0].length; i++) {
      usedPositions.add(i)
    }
  }

  return patterns
}

/**
 * Search a single card pattern
 */
async function searchCardPattern(pattern: ExtractedPattern, env: Env): Promise<any> {
  try {
    let sqlQuery: string
    let bindParams: any[]

    // Select commonly used columns only
    const selectCols = 'card_id, name, ruby, normalized_name, card_type, attribute, level, atk, def, description'

    if (pattern.type === 'cardId') {
      // Search by card ID
      sqlQuery = `SELECT ${selectCols} FROM cards WHERE card_id = ? LIMIT 10`
      bindParams = [pattern.query]
    } else {
      // Search by name
      const normalizedQuery = normalizeForSearch(pattern.query)
      const hasWildcard = pattern.query.includes('*')

      if (pattern.type === 'flexible') {
        // Flexible search: allow wildcards and partial match
        if (hasWildcard) {
          const sqlPattern = normalizedQuery.split('*').join('%')
          sqlQuery = `SELECT ${selectCols} FROM cards WHERE normalized_name LIKE ? LIMIT 10`
          bindParams = [sqlPattern]
        } else {
          sqlQuery = `SELECT ${selectCols} FROM cards WHERE normalized_name LIKE ? LIMIT 10`
          bindParams = [`%${normalizedQuery}%`]
        }
      } else {
        // Exact search
        sqlQuery = `SELECT ${selectCols} FROM cards WHERE normalized_name = ? LIMIT 10`
        bindParams = [normalizedQuery]
      }
    }

    const result = await env.DB.prepare(sqlQuery).bind(...bindParams).all()
    return result.results || []
  } catch (e) {
    console.error('Search card pattern error:', e)
    return []
  }
}

async function handleExtractCards(request: Request, env: Env): Promise<Response> {
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

interface ExtractedPatternWithIndex extends ExtractedPattern {
  startIndex: number
}

/**
 * Extract card patterns with start index
 */
function extractCardPatternsWithIndex(text: string): ExtractedPatternWithIndex[] {
  const patterns: ExtractedPatternWithIndex[] = []
  const usedPositions = new Set<number>()

  // Pattern 1: {{card-name|cid}} - already processed / cardId search
  const cardIdPattern = /\{\{([^|]+)\|([^}]+)\}\}/g
  let match: RegExpExecArray | null

  while ((match = cardIdPattern.exec(text)) !== null) {
    patterns.push({
      pattern: match[0],
      type: 'cardId',
      query: match[2].trim(),
      originalName: match[1].trim(),
      startIndex: match.index
    })

    for (let i = match.index; i < match.index + match[0].length; i++) {
      usedPositions.add(i)
    }
  }

  // Pattern 2: 《card-name》 - exact name search
  const exactPattern = /《([^》]+)》/g
  while ((match = exactPattern.exec(text)) !== null) {
    if (usedPositions.has(match.index)) continue

    patterns.push({
      pattern: match[0],
      type: 'exact',
      query: match[1].trim(),
      startIndex: match.index
    })

    for (let i = match.index; i < match.index + match[0].length; i++) {
      usedPositions.add(i)
    }
  }

  // Pattern 3: {card-name} - flexible name search
  const flexiblePattern = /\{([^}]+)\}/g
  while ((match = flexiblePattern.exec(text)) !== null) {
    if (usedPositions.has(match.index)) continue

    patterns.push({
      pattern: match[0],
      type: 'flexible',
      query: match[1].trim(),
      startIndex: match.index
    })

    for (let i = match.index; i < match.index + match[0].length; i++) {
      usedPositions.add(i)
    }
  }

  return patterns
}

async function handleSeekCards(request: Request, url: URL, env: Env): Promise<Response> {
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
      data: result.results || [],
      total: result.results?.length || 0
    })
  } catch (e) {
    console.error('Seek cards error:', e)
    return errorResponse('Internal server error', 500)
  }
}

async function handleDocs(request: Request, url: URL, env: Env): Promise<Response> {
  const name = url.searchParams.get('name')
  const list = url.searchParams.get('list')

  const docs = {
    version: '1.0.0',
    endpoints: [
      {
        path: '/health',
        method: 'GET',
        description: 'Health check endpoint',
        response: {
          status: 'healthy',
          timestamp: '2026-01-29T00:00:00.000Z'
        }
      },
      {
        path: '/api/stats',
        method: 'GET',
        description: 'Get database statistics',
        response: {
          cards: 12000,
          faqs: 5000,
          timestamp: '2026-01-29T00:00:00.000Z'
        }
      },
      {
        path: '/api/cards/search',
        method: 'GET',
        description: 'Search cards with advanced filters',
        parameters: [
          { name: 'filter[field]', type: 'string', description: 'Filter by field (name, attribute, race, etc.)' },
          { name: 'filter[field][or][]', type: 'string', description: 'OR condition for field' },
          { name: 'filter[field][and][]', type: 'string', description: 'AND condition for field' },
          { name: 'mode', type: 'exact|partial', default: 'exact', description: 'Search mode' },
          { name: 'limit', type: 'number', default: 10, description: 'Maximum number of results (1-100)' },
          { name: 'offset', type: 'number', default: 0, description: 'Result offset (0-1000)' },
          { name: 'auto_modify', type: 'boolean', default: true, description: 'Enable text normalization' },
          { name: 'allow_wild', type: 'boolean', default: true, description: 'Allow wildcard (*) in queries' },
          { name: 'include_ruby', type: 'boolean', default: true, description: 'Include ruby (furigana) search' }
        ],
        examples: [
          '/api/cards/search?filter[name]=青眼*&mode=partial',
          '/api/cards/search?filter[attribute]=光&filter[race]=ドラゴン族',
          '/api/cards/search?filter[atk]=3000&filter[def]=2500'
        ]
      },
      {
        path: '/api/cards/by-id',
        method: 'GET',
        description: 'Get card by ID',
        parameters: [
          { name: 'id', type: 'string', required: true, description: 'Card ID' }
        ],
        examples: ['/api/cards/by-id?id=89631139']
      },
      {
        path: '/api/cards/extract',
        method: 'POST',
        description: 'Extract card patterns from text and search',
        request: {
          text: 'I use {ブルーアイズ*} and 《青眼の白龍》'
        },
        response: {
          matches: [
            {
              pattern: '{ブルーアイズ*}',
              type: 'flexible',
              query: 'ブルーアイズ*',
              results: []
            }
          ],
          total: 1
        }
      },
      {
        path: '/api/cards/replace',
        method: 'POST',
        description: 'Replace card patterns with normalized format',
        request: {
          text: 'I use {ブルーアイズ*}',
          mountPar: false
        },
        response: {
          processedText: 'I use {{青眼の白龍|89631139}}',
          hasUnprocessed: false,
          warnings: [],
          processedPatterns: []
        }
      },
      {
        path: '/api/cards/seek',
        method: 'GET',
        description: 'Get random or range-specified cards',
        parameters: [
          { name: 'max', type: 'number', default: 10, description: 'Maximum number of results (1-100)' },
          { name: 'random', type: 'boolean', default: true, description: 'Random selection' },
          { name: 'range_start', type: 'string', description: 'Start of card ID range' },
          { name: 'range_end', type: 'string', description: 'End of card ID range' },
          { name: 'all', type: 'boolean', default: false, description: 'Get all cards in range (requires range_start/end)' },
          { name: 'cols', type: 'string', description: 'Comma-separated column names' }
        ],
        examples: [
          '/api/cards/seek?max=20&random=true',
          '/api/cards/seek?range_start=4000&range_end=5000&max=30'
        ]
      },
      {
        path: '/api/cards/bulk',
        method: 'POST',
        description: 'Bulk search multiple queries (max 50)',
        request: {
          queries: [
            { filter: { name: '青眼*' }, mode: 'partial' },
            { filter: { cardId: '89631139' } }
          ]
        },
        response: {
          results: [
            { query: 0, data: [], total: 0 },
            { query: 1, data: [], total: 1 }
          ]
        }
      },
      {
        path: '/api/faqs/search',
        method: 'GET',
        description: 'Search FAQs',
        parameters: [
          { name: 'q', type: 'string', required: true, description: 'Search query' },
          { name: 'limit', type: 'number', default: 10, description: 'Maximum number of results' },
          { name: 'offset', type: 'number', default: 0, description: 'Result offset' }
        ]
      },
      {
        path: '/api/cards/semantic-search',
        method: 'GET',
        description: 'Semantic search for cards (requires Vectorize)',
        parameters: [
          { name: 'q', type: 'string', required: true, description: 'Search query' },
          { name: 'limit', type: 'number', default: 10, description: 'Maximum number of results' }
        ]
      },
      {
        path: '/api/faqs/semantic-search',
        method: 'GET',
        description: 'Semantic search for FAQs (requires Vectorize)',
        parameters: [
          { name: 'q', type: 'string', required: true, description: 'Search query' },
          { name: 'limit', type: 'number', default: 10, description: 'Maximum number of results' }
        ]
      }
    ]
  }

  // Handle list parameter
  if (list !== null) {
    const endpointList = docs.endpoints.map(ep => ({
      path: ep.path,
      method: ep.method,
      description: ep.description
    }))

    return Response.json({
      version: docs.version,
      endpoints: endpointList,
      total: endpointList.length
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  // Handle name parameter
  if (name) {
    const endpoint = docs.endpoints.find(ep =>
      ep.path.includes(name) ||
      ep.path.toLowerCase().includes(name.toLowerCase())
    )

    if (!endpoint) {
      return errorResponse(`Endpoint "${name}" not found`, 404, 'NOT_FOUND', [
        `Available endpoints: ${docs.endpoints.map(ep => ep.path).join(', ')}`
      ])
    }

    return Response.json(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  // Return all documentation
  return jsonResponse(docs)
}

/**
 * Parse format string (supports json and jsonl)
 */
function parseFormatString(content: string, format: 'json' | 'jsonl'): any {
  if (format === 'json') {
    return JSON.parse(content)
  } else if (format === 'jsonl') {
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
  }
  throw new Error(`Unsupported format: ${format}`)
}

/**
 * Format data to string (supports json and jsonl)
 */
function formatOutput(data: any, format: 'json' | 'jsonl'): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2)
  } else if (format === 'jsonl') {
    const items = Array.isArray(data) ? data : [data]
    return items.map(item => JSON.stringify(item)).join('\n')
  }
  throw new Error(`Unsupported format: ${format}`)
}

async function handleConvert(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as {
      input?: string
      inputFormat?: 'json' | 'jsonl'
      outputFormat?: 'json' | 'jsonl'
    }

    if (!body || !body.input) {
      return errorResponse('Missing input parameter', 400, 'MISSING_INPUT')
    }

    if (!body.outputFormat) {
      return errorResponse('Missing outputFormat parameter', 400, 'MISSING_OUTPUT_FORMAT')
    }

    // Auto-detect input format if not provided
    let inputFormat: 'json' | 'jsonl' = body.inputFormat || 'json'
    if (!body.inputFormat) {
      // Try to detect format by checking if it's JSONL
      if (body.input.includes('\n') && !body.input.trim().startsWith('[')) {
        inputFormat = 'jsonl'
      }
    }

    // Validate formats
    const validFormats = ['json', 'jsonl']
    if (!validFormats.includes(inputFormat)) {
      return errorResponse(`Invalid inputFormat "${inputFormat}". Valid formats: json, jsonl`, 400, 'INVALID_INPUT_FORMAT')
    }
    if (!validFormats.includes(body.outputFormat)) {
      return errorResponse(`Invalid outputFormat "${body.outputFormat}". Valid formats: json, jsonl`, 400, 'INVALID_OUTPUT_FORMAT')
    }

    // Parse and convert
    const data = parseFormatString(body.input, inputFormat)
    const converted = formatOutput(data, body.outputFormat)

    return Response.json({
      converted,
      inputFormat,
      outputFormat: body.outputFormat
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    console.error('Convert error:', e)
    return errorResponse('Conversion failed', 500, 'CONVERSION_ERROR', [errorMessage])
  }
}

/**
 * Generate embeddings using Azure OpenAI API
 */
async function generateEmbeddings(texts: string[], env: Env): Promise<number[][]> {
  if (!env.AZURE_API_KEY || !env.AZURE_ENDPOINT) {
    throw new Error('Azure OpenAI API credentials not configured')
  }

  const response = await fetch(`${env.AZURE_ENDPOINT}/openai/deployments/${env.AZURE_MODEL || 'text-embedding-ada-002'}/embeddings?api-version=2023-05-15`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': env.AZURE_API_KEY
    },
    body: JSON.stringify({
      input: texts
    })
  })

  if (!response.ok) {
    throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json() as { data: Array<{ embedding: number[] }> }
  return data.data.map(item => item.embedding)
}

async function handleVectorSetup(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as {
      type?: 'cards' | 'faqs' | 'all'
      apiSecret?: string
      batchSize?: number
      limit?: number
    }

    // Authentication check (Secret-based)
    const apiSecret = request.headers.get('X-API-Secret') || body.apiSecret
    if (!apiSecret || apiSecret !== env.API_SECRET) {
      return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
    }

    if (!body || !body.type) {
      return errorResponse('Missing type parameter (cards|faqs|all)', 400, 'MISSING_TYPE')
    }

    const validTypes = ['cards', 'faqs', 'all']
    if (!validTypes.includes(body.type)) {
      return errorResponse(`Invalid type "${body.type}". Valid types: cards, faqs, all`, 400, 'INVALID_TYPE')
    }

    // Check if VECTORIZER is available
    if (!env.VECTORIZER) {
      return errorResponse('Vectorizer not configured', 503, 'VECTORIZER_NOT_CONFIGURED')
    }

    // Check Azure OpenAI configuration
    if (!env.AZURE_API_KEY || !env.AZURE_ENDPOINT) {
      return errorResponse('Azure OpenAI API not configured', 503, 'AZURE_NOT_CONFIGURED', [
        'Set AZURE_API_KEY and AZURE_ENDPOINT in your environment'
      ])
    }

    const batchSize = body.batchSize || 50
    const limit = body.limit || 1000
    let cardsCount = 0
    let faqsCount = 0
    let processedCards = 0
    let processedFaqs = 0

    // Setup cards vectorization
    if (body.type === 'cards' || body.type === 'all') {
      const result = await env.DB.prepare('SELECT card_id, name, description FROM cards LIMIT ?').bind(limit).all()
      const cards = result.results || []

      // Process in batches
      for (let i = 0; i < cards.length; i += batchSize) {
        const batch = cards.slice(i, i + batchSize)
        const texts = batch.map((card: any) => `${card.name}: ${card.description || ''}`)

        try {
          // Generate embeddings
          const embeddings = await generateEmbeddings(texts, env)

          // Upsert to Vectorize
          const vectors = batch.map((card: any, idx: number) => ({
            id: `card_${card.card_id}`,
            values: embeddings[idx],
            metadata: {
              type: 'card',
              card_id: card.card_id,
              name: card.name
            }
          }))

          await env.VECTORIZER.upsert(vectors)
          processedCards += batch.length
        } catch (e) {
          console.error(`Failed to process cards batch ${i}-${i + batch.length}:`, e)
          // Continue with next batch
        }
      }

      cardsCount = cards.length
    }

    // Setup faqs vectorization
    if (body.type === 'faqs' || body.type === 'all') {
      const result = await env.DB.prepare('SELECT faq_id, question, answer FROM faqs LIMIT ?').bind(limit).all()
      const faqs = result.results || []

      // Process in batches
      for (let i = 0; i < faqs.length; i += batchSize) {
        const batch = faqs.slice(i, i + batchSize)
        const texts = batch.map((faq: any) => `Q: ${faq.question} A: ${faq.answer}`)

        try {
          // Generate embeddings
          const embeddings = await generateEmbeddings(texts, env)

          // Upsert to Vectorize
          const vectors = batch.map((faq: any, idx: number) => ({
            id: `faq_${faq.faq_id}`,
            values: embeddings[idx],
            metadata: {
              type: 'faq',
              faq_id: faq.faq_id,
              question: faq.question
            }
          }))

          await env.VECTORIZER.upsert(vectors)
          processedFaqs += batch.length
        } catch (e) {
          console.error(`Failed to process FAQs batch ${i}-${i + batch.length}:`, e)
          // Continue with next batch
        }
      }

      faqsCount = faqs.length
    }

    return Response.json({
      message: `Vector setup completed for ${body.type}`,
      cardsCount,
      faqsCount,
      processedCards,
      processedFaqs,
      batchSize,
      limit
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    console.error('Vector setup error:', e)
    return errorResponse('Vector setup failed', 500, 'VECTOR_SETUP_ERROR', [errorMessage])
  }
}

async function handleVectorSetupGeneric(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as {
      table?: string
      data?: Array<{ id: string; text: string; [key: string]: any }>
      apiSecret?: string
      batchSize?: number
      textField?: string
    }

    // Authentication check
    const apiSecret = request.headers.get('X-API-Secret') || body.apiSecret
    if (!apiSecret || apiSecret !== env.API_SECRET) {
      return errorResponse('Unauthorized', 401, 'UNAUTHORIZED')
    }

    if (!body || !body.table) {
      return errorResponse('Missing table parameter', 400, 'MISSING_TABLE')
    }

    if (!body.data || !Array.isArray(body.data)) {
      return errorResponse('Missing or invalid data parameter (must be array)', 400, 'INVALID_DATA')
    }

    // Check if VECTORIZER is available
    if (!env.VECTORIZER) {
      return errorResponse('Vectorizer not configured', 503, 'VECTORIZER_NOT_CONFIGURED')
    }

    // Check Azure OpenAI configuration
    if (!env.AZURE_API_KEY || !env.AZURE_ENDPOINT) {
      return errorResponse('Azure OpenAI API not configured', 503, 'AZURE_NOT_CONFIGURED', [
        'Set AZURE_API_KEY and AZURE_ENDPOINT in your environment'
      ])
    }

    // Validate data structure
    if (body.data.length === 0) {
      return errorResponse('Data array is empty', 400, 'EMPTY_DATA')
    }

    const textField = body.textField || 'text'
    const batchSize = body.batchSize || 50
    let processedCount = 0

    // Process in batches
    for (let i = 0; i < body.data.length; i += batchSize) {
      const batch = body.data.slice(i, i + batchSize)

      // Extract text for embedding
      const texts = batch.map(item => {
        const text = item[textField]
        if (typeof text !== 'string') {
          throw new Error(`Item at index ${i} does not have valid "${textField}" field`)
        }
        return text
      })

      try {
        // Generate embeddings
        const embeddings = await generateEmbeddings(texts, env)

        // Upsert to Vectorize
        const vectors = batch.map((item, idx) => {
          const metadata: Record<string, string | number | boolean> = {
            type: body.table!,
            id: item.id
          }

          // Add other fields from item
          for (const [key, value] of Object.entries(item)) {
            if (key !== 'id' && (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')) {
              metadata[key] = value
            }
          }

          return {
            id: `${body.table}_${item.id}`,
            values: embeddings[idx],
            metadata
          }
        })

        await env.VECTORIZER.upsert(vectors)
        processedCount += batch.length
      } catch (e) {
        console.error(`Failed to process batch ${i}-${i + batch.length}:`, e)
        // Continue with next batch
      }
    }

    return Response.json({
      message: `Vector setup-generic completed for table "${body.table}"`,
      table: body.table,
      count: body.data.length,
      processedCount,
      batchSize
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    console.error('Vector setup-generic error:', e)
    return errorResponse('Vector setup-generic failed', 500, 'VECTOR_SETUP_GENERIC_ERROR', [errorMessage])
  }
}

/**
 * Parse TSV data
 */
function parseTSV(content: string): Array<Record<string, string>> {
  const lines = content.split('\n').filter(line => line.trim())
  if (lines.length === 0) return []

  const headers = lines[0].split('\t')
  const data: Array<Record<string, string>> = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t')
    const row: Record<string, string> = {}

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || ''
    }

    data.push(row)
  }

  return data
}

async function handleUpdate(request: Request, env: Env): Promise<Response> {
  try {
    // Authentication check (Cron-only)
    const cronHeader = request.headers.get('CF-Cron')
    const apiSecret = request.headers.get('X-API-Secret')

    // Accept either Cron trigger or API secret
    if (!cronHeader && (!apiSecret || apiSecret !== env.API_SECRET)) {
      return errorResponse('Unauthorized - This endpoint is restricted to Cron or authenticated requests only', 401, 'UNAUTHORIZED')
    }

    // Check if R2 bucket is configured
    if (!env.R2_BUCKET) {
      return errorResponse('R2 bucket not configured', 503, 'R2_NOT_CONFIGURED', [
        'Set R2_BUCKET binding in your wrangler.toml'
      ])
    }

    let cardsCount = 0
    let faqsCount = 0

    // Fetch and update cards data
    try {
      const cardsObject = await env.R2_BUCKET.get('data/cards.tsv')
      if (cardsObject) {
        const cardsContent = await cardsObject.text()
        const cardsData = parseTSV(cardsContent)

        // Clear existing data
        await env.DB.prepare('DELETE FROM cards').run()

        // Insert new data in batches
        const batchSize = 100
        for (let i = 0; i < cardsData.length; i += batchSize) {
          const batch = cardsData.slice(i, i + batchSize)

          for (const card of batch) {
            // Normalize fields for D1 insertion
            const normalized_name = normalizeForSearch(card.name || '')
            const normalized_ruby = normalizeForSearch(card.ruby || '')

            await env.DB.prepare(
              'INSERT INTO cards (card_id, name, ruby, normalized_name, normalized_ruby, card_type, attribute, level, atk, def, description, race, monster_types, spell_effect_type, trap_effect_type, link_markers, link_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(
              card.card_id || '',
              card.name || '',
              card.ruby || '',
              normalized_name,
              normalized_ruby,
              card.card_type || '',
              card.attribute || '',
              card.level || '',
              card.atk || '',
              card.def || '',
              card.description || '',
              card.race || '',
              card.monster_types || '',
              card.spell_effect_type || '',
              card.trap_effect_type || '',
              card.link_markers || '',
              card.link_value || ''
            ).run()
          }
        }

        cardsCount = cardsData.length
      }
    } catch (e) {
      console.error('Failed to update cards:', e)
    }

    // Fetch and update FAQs data
    try {
      const faqsObject = await env.R2_BUCKET.get('data/faqs.tsv')
      if (faqsObject) {
        const faqsContent = await faqsObject.text()
        const faqsData = parseTSV(faqsContent)

        // Clear existing data
        await env.DB.prepare('DELETE FROM faqs').run()

        // Insert new data in batches
        const batchSize = 100
        for (let i = 0; i < faqsData.length; i += batchSize) {
          const batch = faqsData.slice(i, i + batchSize)

          for (const faq of batch) {
            const normalized_question = normalizeForSearch(faq.question || '')
            const normalized_answer = normalizeForSearch(faq.answer || '')

            await env.DB.prepare(
              'INSERT INTO faqs (faq_id, question, answer, normalized_question, normalized_answer) VALUES (?, ?, ?, ?, ?)'
            ).bind(
              faq.faq_id || '',
              faq.question || '',
              faq.answer || '',
              normalized_question,
              normalized_answer
            ).run()
          }
        }

        faqsCount = faqsData.length
      }
    } catch (e) {
      console.error('Failed to update FAQs:', e)
    }

    const timestamp = new Date().toISOString()

    return Response.json({
      updated: true,
      cards: cardsCount,
      faqs: faqsCount,
      timestamp
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    console.error('Update error:', e)
    return errorResponse('Update failed', 500, 'UPDATE_ERROR', [errorMessage])
  }
}

async function handleBulkSearch(request: Request, env: Env): Promise<Response> {
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
        const sqlQuery = `SELECT ${selectCols} FROM cards WHERE ${whereClause} LIMIT ? OFFSET ?`
        bindParams.push(limit, offset)

        const result = await env.DB.prepare(sqlQuery).bind(...bindParams).all()

        return {
          query: index,
          data: result.results || [],
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

async function handleReplaceCards(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { text?: string; mountPar?: boolean }

    if (!body || !body.text) {
      return errorResponse('Missing text parameter', 400)
    }

    const text = body.text
    const mountPar = body.mountPar || false

    if (text.length > 10000) {
      return errorResponse('Text too long (max 10000 characters)', 400)
    }

    // Extract patterns with index
    const patterns = extractCardPatternsWithIndex(text)

    if (patterns.length === 0) {
      return Response.json({
        processedText: text,
        hasUnprocessed: false,
        warnings: [],
        processedPatterns: []
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Deduplicate patterns before search for efficiency
    const uniquePatternMap = new Map<string, typeof patterns[0]>()
    for (const pattern of patterns) {
      const key = `${pattern.type}::${pattern.query}`
      if (!uniquePatternMap.has(key)) {
        uniquePatternMap.set(key, pattern)
      }
    }
    const uniquePatterns = Array.from(uniquePatternMap.values())

    // Search unique patterns only
    const searchPromises = uniquePatterns.map(pattern => searchCardPattern(pattern, env))
    const uniqueSearchResults = await Promise.all(searchPromises)

    // Create lookup map for search results
    const resultMap = new Map<string, any[]>()
    for (let i = 0; i < uniquePatterns.length; i++) {
      const pattern = uniquePatterns[i]
      const key = `${pattern.type}::${pattern.query}`
      resultMap.set(key, uniqueSearchResults[i])
    }

    // Map search results back to original patterns
    const searchResults = patterns.map(pattern => {
      const key = `${pattern.type}::${pattern.query}`
      return resultMap.get(key) || []
    })

    // Process replacements in reverse order to maintain indices
    const sortedPatterns = patterns
      .map((pattern, index) => ({ pattern, results: searchResults[index] }))
      .sort((a, b) => b.pattern.startIndex - a.pattern.startIndex)

    let processedText = text
    const processedPatterns: Array<{
      original: string
      replaced: string
      status: 'resolved' | 'multiple' | 'notfound' | 'already_processed' | 'corrected'
    }> = []
    const warnings: string[] = []
    let hasUnprocessed = false

    for (const { pattern, results } of sortedPatterns) {
      const resultCount = results.length

      if (pattern.type === 'cardId') {
        // cardId pattern: verify card name
        if (resultCount === 1) {
          const card = results[0]
          const actualName = card.name
          const providedName = pattern.originalName || ''

          if (actualName !== providedName) {
            // Correct card name
            const replacement = mountPar ? `《${actualName}》` : `{{${actualName}|${card.card_id}}}`
            processedText = processedText.substring(0, pattern.startIndex) +
                          replacement +
                          processedText.substring(pattern.startIndex + pattern.pattern.length)

            processedPatterns.push({
              original: pattern.pattern,
              replaced: replacement,
              status: 'corrected'
            })

            warnings.push(`Card name corrected: "${providedName}" → "${actualName}" (cardId: ${card.card_id})`)
          } else {
            // Already correct
            processedPatterns.push({
              original: pattern.pattern,
              replaced: pattern.pattern,
              status: 'already_processed'
            })
          }
        } else if (resultCount === 0) {
          warnings.push(`cardId "${pattern.query}" not found`)
        } else {
          warnings.push(`cardId "${pattern.query}" found multiple cards. Please check data.`)
        }
      } else if (resultCount === 1) {
        // Exactly one result - replace
        const card = results[0]
        const replacement = mountPar ? `《${card.name}》` : `{{${card.name}|${card.card_id}}}`
        processedText = processedText.substring(0, pattern.startIndex) +
                      replacement +
                      processedText.substring(pattern.startIndex + pattern.pattern.length)

        processedPatterns.push({
          original: pattern.pattern,
          replaced: replacement,
          status: 'resolved'
        })
      } else if (resultCount > 1) {
        // Multiple results
        const candidatesStr = results
          .map((card: any) => `\`${card.name}|${card.card_id}\``)
          .join('_')
        const replacement = `{{\`${pattern.query}\`_${candidatesStr}}}`
        processedText = processedText.substring(0, pattern.startIndex) +
                      replacement +
                      processedText.substring(pattern.startIndex + pattern.pattern.length)

        processedPatterns.push({
          original: pattern.pattern,
          replaced: replacement,
          status: 'multiple'
        })
        hasUnprocessed = true
      } else {
        // No results
        const replacement = `{{NOTFOUND_\`${pattern.query}\`}}`
        processedText = processedText.substring(0, pattern.startIndex) +
                      replacement +
                      processedText.substring(pattern.startIndex + pattern.pattern.length)

        processedPatterns.push({
          original: pattern.pattern,
          replaced: replacement,
          status: 'notfound'
        })
        hasUnprocessed = true
      }
    }

    if (hasUnprocessed) {
      warnings.push('Text contains unprocessed patterns that require manual review')

      // Add detailed warnings
      const notfoundCount = processedPatterns.filter(p => p.status === 'notfound').length
      const multipleCount = processedPatterns.filter(p => p.status === 'multiple').length

      if (notfoundCount > 0) {
        warnings.push(`Found ${notfoundCount} pattern(s) with no matches (NOTFOUND_*)`)
      }
      if (multipleCount > 0) {
        warnings.push(`Found ${multipleCount} pattern(s) with multiple matches - please select correct one`)
      }
    }

    return Response.json({
      processedText,
      hasUnprocessed,
      warnings,
      processedPatterns
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (e) {
    console.error('Replace cards error:', e)
    return errorResponse('Internal server error', 500)
  }
}
