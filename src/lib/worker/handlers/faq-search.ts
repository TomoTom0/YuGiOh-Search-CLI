import type { Env } from '../../../worker.js'
import { errorResponse, jsonResponse } from '../response.js'
import { MAX_LIMIT, MAX_OFFSET } from '../validation.js'
import { normalizeForSearch } from '../../shared/normalizer.js'
import { buildWhereClause, parseFilterParams } from '../filters.js'

interface FAQSearchParams {
  q?: string
  faqId?: number
  cardId?: string
  cardName?: string
  cardFilter?: Record<string, unknown>
  question?: string
  answer?: string
  limit?: number
  offset?: number
  allowWild?: boolean
}

function isString(val: unknown): val is string {
  return typeof val === 'string'
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function mapFaqDbToApi(row: Record<string, unknown>) {
  return {
    faqId: row.faq_id,
    cardId: row.card_id,
    question: row.question,
    answer: row.answer,
    createdAt: row.created_at
  }
}

function textToLikePattern(text: string, allowWild: boolean): string {
  const normalized = normalizeForSearch(text)
  if (allowWild && text.includes('*')) {
    return normalized.split('*').join('%')
  }
  return `%${normalized}%`
}

async function extractParams(request: Request, url: URL): Promise<FAQSearchParams> {
  if (request.method === 'POST') {
    try {
      const body = await request.json()
      if (!isObject(body)) return {}
      return {
        q: isString(body.q) ? body.q : undefined,
        faqId: body.faqId != null ? Number(body.faqId) : undefined,
        cardId: isString(body.cardId) ? body.cardId : undefined,
        cardName: isString(body.cardName) ? body.cardName : undefined,
        cardFilter: isObject(body.cardFilter) ? body.cardFilter : undefined,
        question: isString(body.question) ? body.question : undefined,
        answer: isString(body.answer) ? body.answer : undefined,
        limit: body.limit != null ? Number(body.limit) : undefined,
        offset: body.offset != null ? Number(body.offset) : undefined,
        allowWild: body.allowWild === true
      }
    } catch {
      return {}
    }
  }

  const sp = url.searchParams
  return {
    q: sp.get('q') ?? undefined,
    faqId: sp.has('faqId') ? parseInt(sp.get('faqId')!, 10) : undefined,
    cardId: sp.get('cardId') ?? undefined,
    cardName: sp.get('cardName') ?? undefined,
    question: sp.get('question') ?? undefined,
    answer: sp.get('answer') ?? undefined,
    limit: sp.has('limit') ? parseInt(sp.get('limit')!, 10) : undefined,
    offset: sp.has('offset') ? parseInt(sp.get('offset')!, 10) : undefined,
    allowWild: sp.get('allowWild') === 'true'
  }
}

export async function handleFAQSearch(request: Request, url: URL, env: Env): Promise<Response> {
  const params = await extractParams(request, url)
  const limit = Math.min(Math.max(params.limit || 10, 1), MAX_LIMIT)
  const offset = Math.min(Math.max(params.offset || 0, 0), MAX_OFFSET)
  const allowWild = params.allowWild ?? true

  const faqColumns = 'f.faq_id, f.card_id, f.question, f.answer, f.created_at'

  // 1. faqId - exact lookup
  if (params.faqId != null) {
    if (isNaN(params.faqId)) {
      return errorResponse('faqId must be a number', 400)
    }
    const result = await env.DB.prepare(
      `SELECT ${faqColumns} FROM faqs f WHERE f.faq_id = ?`
    ).bind(params.faqId).first()

    if (!result) {
      return jsonResponse({ data: [], query: { faqId: params.faqId }, limit, offset, total: 0 })
    }
    return jsonResponse({ data: [mapFaqDbToApi(result)], query: { faqId: params.faqId }, limit, offset, total: 1 })
  }

  // 2. cardId - FAQs referencing a card
  if (params.cardId) {
    const result = await env.DB.prepare(
      `SELECT ${faqColumns} FROM faqs f ` +
      `INNER JOIN faq_card_references fcr ON f.faq_id = fcr.faq_id ` +
      `WHERE fcr.card_id = ? ORDER BY f.faq_id ASC LIMIT ? OFFSET ?`
    ).bind(params.cardId, limit, offset).all()

    const data = (result.results || []).map(mapFaqDbToApi)
    return jsonResponse({ data, query: { cardId: params.cardId }, limit, offset, total: data.length })
  }

  // 3. cardName - resolve card name then find FAQs
  if (params.cardName) {
    const cardPattern = textToLikePattern(params.cardName, allowWild)
    const faqResult = await env.DB.prepare(
      `SELECT DISTINCT ${faqColumns} FROM faqs f ` +
      `INNER JOIN faq_card_references fcr ON f.faq_id = fcr.faq_id ` +
      `WHERE fcr.card_id IN (SELECT card_id FROM cards WHERE normalized_name LIKE ?) ` +
      `ORDER BY f.faq_id ASC LIMIT ? OFFSET ?`
    ).bind(cardPattern, limit, offset).all()

    const data = (faqResult.results || []).map(mapFaqDbToApi)
    return jsonResponse({ data, query: { cardName: params.cardName }, limit, offset, total: data.length })
  }

  // 4. cardFilter - filter cards then find FAQs (POST only)
  if (params.cardFilter && typeof params.cardFilter === 'object') {
    if (request.method !== 'POST') {
      return errorResponse('cardFilter requires POST method', 400)
    }

    const searchParams = new URLSearchParams()
    for (const [key, value] of Object.entries(params.cardFilter)) {
      if (Array.isArray(value)) {
        for (const v of value) {
          searchParams.append(`filter[${key}][]`, String(v))
        }
      } else {
        searchParams.set(`filter[${key}]`, String(value))
      }
    }

    const filter = parseFilterParams(searchParams)
    const [whereClause, bindParams] = buildWhereClause(filter, 'partial', true, allowWild, false)

    const faqResult = await env.DB.prepare(
      `SELECT DISTINCT ${faqColumns} FROM faqs f ` +
      `INNER JOIN faq_card_references fcr ON f.faq_id = fcr.faq_id ` +
      `WHERE fcr.card_id IN (SELECT card_id FROM cards WHERE ${whereClause}) ` +
      `ORDER BY f.faq_id ASC LIMIT ? OFFSET ?`
    ).bind(...bindParams, limit, offset).all()

    const data = (faqResult.results || []).map(mapFaqDbToApi)
    return jsonResponse({ data, query: { cardFilter: params.cardFilter }, limit, offset, total: data.length })
  }

  // 5. question / answer / q - text search
  const hasQuestion = !!params.question
  const hasAnswer = !!params.answer
  const hasQ = !!params.q

  if (!hasQuestion && !hasAnswer && !hasQ) {
    return errorResponse('Missing query parameter. Provide q, question, answer, faqId, cardId, cardName, or cardFilter', 400)
  }

  let sql: string
  let binds: unknown[]

  if (hasQuestion && hasAnswer) {
    sql = `SELECT ${faqColumns} FROM faqs f WHERE f.normalized_question LIKE ? AND f.normalized_answer LIKE ? LIMIT ? OFFSET ?`
    binds = [textToLikePattern(params.question!, allowWild), textToLikePattern(params.answer!, allowWild), limit, offset]
  } else if (hasQuestion) {
    sql = `SELECT ${faqColumns} FROM faqs f WHERE f.normalized_question LIKE ? LIMIT ? OFFSET ?`
    binds = [textToLikePattern(params.question!, allowWild), limit, offset]
  } else if (hasAnswer) {
    sql = `SELECT ${faqColumns} FROM faqs f WHERE f.normalized_answer LIKE ? LIMIT ? OFFSET ?`
    binds = [textToLikePattern(params.answer!, allowWild), limit, offset]
  } else {
    const pattern = textToLikePattern(params.q!, allowWild)
    sql = `SELECT ${faqColumns} FROM faqs f WHERE f.normalized_question LIKE ? OR f.normalized_answer LIKE ? LIMIT ? OFFSET ?`
    binds = [pattern, pattern, limit, offset]
  }

  try {
    const result = await env.DB.prepare(sql).bind(...binds).all()
    const data = (result.results || []).map(mapFaqDbToApi)
    const queryEcho: Record<string, unknown> = {}
    if (hasQ) queryEcho.q = params.q
    if (hasQuestion) queryEcho.question = params.question
    if (hasAnswer) queryEcho.answer = params.answer
    return jsonResponse({ data, query: queryEcho, limit, offset, total: data.length })
  } catch (e) {
    console.error('FAQ search error:', e)
    return errorResponse('Internal server error', 500)
  }
}
