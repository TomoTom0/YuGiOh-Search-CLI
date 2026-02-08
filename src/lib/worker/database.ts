/**
 * Database helper functions for worker API endpoints
 */

import type { Env } from '../../worker.js'

/**
 * Get a card by ID
 * @param cardId - The card ID
 * @param env - The environment variables
 * @returns Card object or null if not found
 */
export async function getCardById(cardId: string, env: Env) {
  const result = await env.DB.prepare(
    'SELECT * FROM cards WHERE card_id = ?'
  ).bind(cardId).first()

  return result
}

/**
 * Get database statistics
 * @param env - The environment variables
 * @returns Statistics object with card and FAQ counts
 */
export async function getStats(env: Env) {
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
