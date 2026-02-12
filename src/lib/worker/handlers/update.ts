/**
 * Update handler for worker API endpoint
 */

import type { Env } from '../../../worker.js'
import { errorResponse } from '../response.js'
import { normalizeForSearch } from '../../shared/normalizer.js'

/**
 * Parse TSV data
 * @param content - TSV content
 * @returns Array of objects with TSV data
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

/**
 * Handle update API endpoint
 * @param request - The incoming request
 * @param env - The environment variables
 * @returns Response with update status
 */
export async function handleUpdate(request: Request, env: Env): Promise<Response> {
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

          const statements = batch.map(card => {
            // Normalize fields for D1 insertion
            const normalized_name = normalizeForSearch(card.name || '')
            const normalized_ruby = normalizeForSearch(card.ruby || '')

            return env.DB.prepare(
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
            )
          })

          await env.DB.batch(statements)
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

          const statements = batch.map(faq => {
            const normalized_question = normalizeForSearch(faq.question || '')
            const normalized_answer = normalizeForSearch(faq.answer || '')

            return env.DB.prepare(
              'INSERT INTO faqs (faq_id, question, answer, normalized_question, normalized_answer) VALUES (?, ?, ?, ?, ?)'
            ).bind(
              faq.faq_id || '',
              faq.question || '',
              faq.answer || '',
              normalized_question,
              normalized_answer
            )
          })

          await env.DB.batch(statements)
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
