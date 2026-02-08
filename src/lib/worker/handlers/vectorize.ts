/**
 * Vectorization handlers for worker API endpoints
 */

import type { Env } from '../../../worker.js'
import { errorResponse } from '../response.js'
import { embedTextWithAzure } from '../embeddings.js'

/**
 * Handle vectorize cards API endpoint
 * @param env - The environment variables
 * @returns Response with vectorization status
 */
export async function handleVectorizeCards(env: Env): Promise<Response> {
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

/**
 * Handle vectorize FAQs API endpoint
 * @param env - The environment variables
 * @returns Response with vectorization status
 */
export async function handleVectorizeFAQs(env: Env): Promise<Response> {
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

/**
 * Handle vector setup API endpoint
 * @param request - The incoming request
 * @param env - The environment variables
 * @returns Response with vector setup status
 */
export async function handleVectorSetup(request: Request, env: Env): Promise<Response> {
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

    const { generateEmbeddings } = await import('../embeddings.js')
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

/**
 * Handle generic vector setup API endpoint
 * @param request - The incoming request
 * @param env - The environment variables
 * @returns Response with vector setup status
 */
export async function handleVectorSetupGeneric(request: Request, env: Env): Promise<Response> {
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

    const { generateEmbeddings } = await import('../embeddings.js')
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
