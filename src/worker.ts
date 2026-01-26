import type { D1Database, KVNamespace, AnalyticsEngineDataset, VectorizeIndex } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  KV?: KVNamespace
  ANALYTICS?: AnalyticsEngineDataset
  VECTORIZER?: VectorizeIndex
  AZURE_API_KEY?: string
  AZURE_MODEL?: string
  AZURE_ENDPOINT?: string
}

const CACHE_TTL = 3600 // 1 hour
const MAX_LIMIT = 100
const MAX_OFFSET = 1000
const RATE_LIMIT_TTL = 60 // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 60 // requests per minute

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const startTime = Date.now()
    const url = new URL(request.url)
    const path = url.pathname

    // Rate limiting
    const clientIP = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const rateLimitResult = await checkRateLimit(clientIP, env)
    if (!rateLimitResult.success) {
      logRequest(env, request, 429, 0, 'rate_limit_exceeded')
      return errorResponse('Rate limit exceeded', 429, {
        'Retry-After': String(rateLimitResult.retryAfter ?? 60)
      })
    }

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
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      })
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
    } else {
      response = await jsonWithCache({ message: 'YGO Search API', version: '1.0.0' }, 'info', env)
    }

    const duration = Date.now() - startTime
    logRequest(env, request, response.status, duration, path.substring(1))

    return response
  }
}

function logRequest(env: Env, request: Request, status: number, duration: number, path: string): void {
  if (!env.ANALYTICS) return

  try {
    env.ANALYTICS.writeDataPoint({
      blobs: [path, request.headers.get('user-agent') || 'unknown', request.headers.get('referer') || 'none'],
      doubles: [duration],
      indexes: [String(status)]
    })
  } catch (e) {
    console.error('Failed to log request:', e)
  }
}

function errorResponse(message: string, status: number, extraHeaders: Record<string, string> = {}): Response {
  return Response.json({ error: message }, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders
    }
  })
}

async function checkRateLimit(clientIP: string, env: Env): Promise<{ success: boolean; retryAfter?: number }> {
  if (!env.KV) return { success: true }

  try {
    const key = `ratelimit:${clientIP}`
    const current = await env.KV.get(key, 'json') as { count: number; resetTime: number } | null

    if (!current || Date.now() > current.resetTime) {
      await env.KV.put(key, JSON.stringify({
        count: 1,
        resetTime: Date.now() + RATE_LIMIT_TTL * 1000
      }), { expirationTtl: RATE_LIMIT_TTL })
      return { success: true }
    }

    if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
      const retryAfter = Math.ceil((current.resetTime - Date.now()) / 1000)
      return { success: false, retryAfter }
    }

    await env.KV.put(key, JSON.stringify({
      count: current.count + 1,
      resetTime: current.resetTime
    }), { expirationTtl: RATE_LIMIT_TTL })
    return { success: true }
  } catch (e) {
    return { success: true }
  }
}

async function handleCardSearch(request: Request, url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get('q') || ''
  const limit = parseInt(url.searchParams.get('limit') || '10', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  const sort = url.searchParams.get('sort') || undefined
  
  const attribute = url.searchParams.get('attribute') || undefined
  const race = url.searchParams.get('race') || undefined
  const cardType = url.searchParams.get('cardType') || undefined
  const level = url.searchParams.get('level') || undefined
  const atk = url.searchParams.get('atk') || undefined
  const def = url.searchParams.get('def') || undefined
  const text = url.searchParams.get('text') || undefined
  
  if (query.length > 200) {
    return errorResponse('Query too long', 400)
  }
  
  if (limit > MAX_LIMIT || limit < 1) {
    return errorResponse(`Limit must be between 1 and ${MAX_LIMIT}`, 400)
  }
  
  if (offset < 0 || offset > MAX_OFFSET) {
    return errorResponse(`Offset must be between 0 and ${MAX_OFFSET}`, 400)
  }
  
  const cacheKey = `cards:${query}:${limit}:${offset}:${attribute || ''}:${race || ''}:${cardType || ''}:${level || ''}:${atk || ''}:${def || ''}:${text || ''}:${sort || ''}`
  const cached = await getFromCache(cacheKey, env)
  if (cached) {
    return cached
  }
  
  try {
    const results = await searchCardsExtended(query, env, limit, offset, { attribute, race, cardType, level, atk, def, text, sort })
    return jsonWithCache(results, cacheKey, env)
  } catch (e) {
    console.error('Card search error:', e)
    return errorResponse('Internal server error', 500)
  }
}

async function handleFAQSearch(request: Request, url: URL, env: Env): Promise<Response> {
  const query = url.searchParams.get('q')
  const limit = parseInt(url.searchParams.get('limit') || '10', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)
  
  console.log('[DEBUG] FAQ search request:', { query, limit, offset })
  
  if (!query) {
    return errorResponse('Missing query parameter', 400)
  }
  
  if (query.length > 200) {
    return errorResponse('Query too long', 400)
  }
  
  if (limit > MAX_LIMIT || limit < 1) {
    return errorResponse(`Limit must be between 1 and ${MAX_LIMIT}`, 400)
  }
  
  if (offset < 0 || offset > MAX_OFFSET) {
    return errorResponse(`Offset must be between 0 and ${MAX_OFFSET}`, 400)
  }
  
  const cacheKey = `faqs:${query}:${limit}:${offset}`
  console.log('[DEBUG] Cache key:', cacheKey)
  const cached = await getFromCache(cacheKey, env)
  if (cached) {
    console.log('[DEBUG] Cache hit')
    return cached
  }
  console.log('[DEBUG] Cache miss')
  
  try {
    console.log('[DEBUG] Calling searchFAQs')
    const results = await searchFAQs(query, env, limit, offset)
    console.log('[DEBUG] searchFAQs result:', JSON.stringify(results))
    return jsonWithCache(results, cacheKey, env)
  } catch (e) {
    console.error('[DEBUG] FAQ search error:', e)
    console.error('[DEBUG] Query:', query)
    console.error('[DEBUG] Error details:', e)
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

  const cacheKey = `card:${cardId}`
  const cached = await getFromCache(cacheKey, env)
  if (cached) {
    return cached
  }

  try {
    const result = await getCardById(cardId, env)
    if (!result) {
      return errorResponse('Card not found', 404)
    }

    return jsonWithCache(result, cacheKey, env)
  } catch (e) {
    console.error('Card by ID error:', e)
    return errorResponse('Internal server error', 500)
  }
}

async function handleStats(env: Env): Promise<Response> {
  try {
    const stats = await getStats(env)
    return jsonWithCache(stats, 'stats', env)
  } catch (e) {
    console.error('Stats error:', e)
    return errorResponse('Internal server error', 500)
  }
}

async function getFromCache(key: string, env: Env): Promise<Response | null> {
  if (!env.KV) return null
  try {
    const cached = await env.KV.get(key, 'json')
    if (cached) {
      return Response.json(cached, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'X-Cache': 'HIT'
        }
      })
    }
  } catch (e) {
    // Cache error, ignore and proceed
  }
  return null
}

async function jsonWithCache(data: any, key: string, env: Env): Promise<Response> {
  const response = Response.json(data, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'X-Cache': 'MISS',
      'Cache-Control': `public, max-age=${CACHE_TTL}`
    }
  })

  if (env.KV) {
    env.KV.put(key, JSON.stringify(data), { expirationTtl: CACHE_TTL }).catch(() => {})
  }

  return response
}

async function searchCards(query: string, env: Env, limit: number, offset: number) {
  const normalizedQuery = query.toLowerCase().replace(/[\s・]/g, '')
  
  const results = await env.DB.prepare(
    'SELECT card_id, name, description, card_type, attribute, level, atk, def FROM cards WHERE normalized_name LIKE ? LIMIT ? OFFSET ?'
  ).bind(`%${normalizedQuery}%`, limit, offset).all()
  
  return {
    data: results.results,
    query,
    limit,
    offset,
    total: results.results.length
  }
}

interface SearchOptions {
  attribute?: string
  race?: string
  cardType?: string
  level?: string
  atk?: string
  def?: string
  text?: string
  sort?: string
  monster_types?: string
  spell_effect_type?: string
  trap_effect_type?: string
  link_markers?: string
  link_value?: string
}

function normalizeForAPI(str: string): string {
  return str.toLowerCase().replace(/[\s・]/g, '')
}

async function searchCardsExtended(query: string, env: Env, limit: number, offset: number, options: SearchOptions) {
  const conditions: string[] = []
  const params: any[] = []
  
  if (query) {
    const normalizedQuery = query.toLowerCase().replace(/[\s・]/g, '')
    conditions.push('normalized_name LIKE ?')
    params.push(`%${normalizedQuery}%`)
  }
  
  if (options.attribute) {
    conditions.push('attribute = ?')
    params.push(options.attribute)
  }
  
  if (options.race) {
    conditions.push('race = ?')
    params.push(normalizeForAPI(options.race))
  }
  
  if (options.cardType) {
    conditions.push('card_type = ?')
    params.push(options.cardType)
  }
  
  if (options.level) {
    const levelNum = parseInt(options.level)
    if (!isNaN(levelNum)) {
      conditions.push('level = ?')
      params.push(levelNum)
    }
  }
  
  if (options.atk) {
    const atkNum = parseInt(options.atk)
    if (!isNaN(atkNum)) {
      conditions.push('atk = ?')
      params.push(atkNum)
    }
  }
  
  if (options.def) {
    const defNum = parseInt(options.def)
    if (!isNaN(defNum)) {
      conditions.push('def = ?')
      params.push(defNum)
    }
  }
  
  if (options.text) {
    const normalizedText = normalizeForAPI(options.text)
    conditions.push('description LIKE ?')
    params.push(`%${normalizedText}%`)
  }
  
  if (options.monster_types) {
    conditions.push('monster_types = ?')
    params.push(normalizeForAPI(options.monster_types))
  }
  
  if (options.spell_effect_type) {
    conditions.push('spell_effect_type = ?')
    params.push(normalizeForAPI(options.spell_effect_type))
  }
  
  if (options.trap_effect_type) {
    conditions.push('trap_effect_type = ?')
    params.push(normalizeForAPI(options.trap_effect_type))
  }
  
  if (options.link_markers) {
    conditions.push('link_markers = ?')
    params.push(normalizeForAPI(options.link_markers))
  }
  
  if (options.link_value) {
    const linkValueNum = parseInt(options.link_value)
    if (!isNaN(linkValueNum)) {
      conditions.push('link_value = ?')
      params.push(linkValueNum)
    }
  }
  
  if (options.race) {
    conditions.push('race = ?')
    params.push(normalizeForAPI(options.race))
  }
  
  if (options.attribute) {
    conditions.push('attribute = ?')
    params.push(normalizeForAPI(options.attribute))
  }
  
  if (options.cardType) {
    conditions.push('card_type = ?')
    params.push(normalizeForAPI(options.cardType))
  }
  
  if (options.level) {
    const levelNum = parseInt(options.level)
    if (!isNaN(levelNum)) {
      conditions.push('level = ?')
      params.push(levelNum)
    }
  }
  
  if (options.atk) {
    const atkNum = parseInt(options.atk)
    if (!isNaN(atkNum)) {
      conditions.push('atk = ?')
      params.push(atkNum)
    }
  }
  
  if (options.def) {
    const defNum = parseInt(options.def)
    if (!isNaN(defNum)) {
      conditions.push('def = ?')
      params.push(defNum)
    }
  }
  
  if (options.race) {
    conditions.push('race = ?')
    params.push(normalizeForAPI(options.race))
  }
  
  if (options.monsterTypes) {
    conditions.push('monster_types = ?')
    params.push(normalizeForAPI(options.monsterTypes))
  }
  
  if (options.spellEffectType) {
    conditions.push('spell_effect_type = ?')
    params.push(normalizeForAPI(options.spellEffectType))
  }
  
  if (options.trapEffectType) {
    conditions.push('trap_effect_type = ?')
    params.push(normalizeForAPI(options.trapEffectType))
  }
  
  if (options.linkMarkers) {
    conditions.push('link_markers = ?')
    params.push(normalizeForAPI(options.linkMarkers))
  }
  
  if (options.linkValue) {
    const linkValueNum = parseInt(options.linkValue)
    if (!isNaN(linkValueNum)) {
      conditions.push('link_value = ?')
      params.push(linkValueNum)
    }
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  let orderClause = ''
  
  if (options.sort) {
    const [field, order] = options.sort.split(':')
    const validFields = ['card_id', 'name', 'attribute', 'level', 'atk', 'def']
    if (validFields.includes(field)) {
      const orderDir = order === 'desc' ? 'DESC' : 'ASC'
      orderClause = `ORDER BY ${field} ${orderDir}`
    }
  }
  
  const results = await env.DB.prepare(
    `SELECT card_id, name, description, card_type, attribute, level, atk, def FROM cards ${whereClause} ${orderClause} LIMIT ? OFFSET ?`
  ).bind(...params, limit, offset).all()
  
  return {
    data: results.results,
    query,
    limit,
    offset,
    total: results.results.length
  }
}

async function searchFAQs(query: string, env: Env, limit: number, offset: number) {
  const normalizedQuery = query.toLowerCase().replace(/[\s・]/g, '')

  const results = await env.DB.prepare(
    'SELECT faq_id, question, answer FROM faqs WHERE normalized_question LIKE ? OR normalized_answer LIKE ? LIMIT ? OFFSET ?'
  ).bind(`%${normalizedQuery}%`, `%${normalizedQuery}%`, limit, offset).all()

  return {
    data: results.results,
    query,
    limit,
    offset,
    total: results.results.length
  }
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
      topK: limit,
      namespace: 'cards',
      filter: { type: 'card' }
    })

    const cardIds = results.matches?.map(m => m.id) || []
    if (cardIds.length === 0) {
      return jsonWithCache({ data: [], query, limit, total: 0 }, `semantic-cards:${query}:${limit}`, env)
    }

    const placeholders = cardIds.map(() => '?').join(',')
    const cards = await env.DB.prepare(
      `SELECT card_id, name, description, card_type, attribute, level, atk, def FROM cards WHERE card_id IN (${placeholders})`
    ).bind(...cardIds).all() as { results: any[] }

    return jsonWithCache({
      data: cards.results,
      query,
      limit,
      total: cards.results.length,
      scores: results.matches?.map(m => m.score)
    }, `semantic-cards:${query}:${limit}`, env)
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
      namespace: 'faqs',
      filter: { type: 'faq' }
    })

    const faqIds = results.matches?.map(m => m.id) || []
    if (faqIds.length === 0) {
      return jsonWithCache({ data: [], query, limit, total: 0 }, `semantic-faqs:${query}:${limit}`, env)
    }

    const placeholders = faqIds.map(() => '?').join(',')
    const faqs = await env.DB.prepare(
      `SELECT faq_id, question, answer FROM faqs WHERE faq_id IN (${placeholders})`
    ).bind(...faqIds).all() as { results: any[] }

    return jsonWithCache({
      data: faqs.results,
      query,
      limit,
      total: faqs.results.length,
      scores: results.matches?.map(m => m.score)
    }, `semantic-faqs:${query}:${limit}`, env)
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
