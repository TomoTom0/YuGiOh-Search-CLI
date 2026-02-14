/**
 * Database helper functions for worker API endpoints
 */

import type { Env } from '../../worker.js'
import type { Card } from '../../types/card.js'

/**
 * Map database row (snake_case) to API response (camelCase)
 * @param dbRow - Database row with snake_case fields
 * @returns Card object with camelCase fields
 */
export function mapCardDbToApi(dbRow: any): Card {
  if (!dbRow) return null as any

  return {
    cardId: dbRow.card_id,
    name: dbRow.name,
    ruby: dbRow.ruby || '',
    nameModified: dbRow.normalized_name || dbRow.name,
    ciid: dbRow.ciid,
    imgs: dbRow.imgs,
    cardType: dbRow.card_type,
    text: dbRow.description || '',

    attribute: dbRow.attribute,
    levelType: dbRow.level_type as 'level' | 'rank' | 'link' | undefined,
    levelValue: dbRow.level?.toString(),
    race: dbRow.race,
    monsterTypes: dbRow.monster_types,
    atk: dbRow.atk?.toString(),
    def: dbRow.def?.toString(),
    linkMarkers: dbRow.link_markers,
    pendulumScale: dbRow.pendulum_scale,
    pendulumText: dbRow.pendulum_text,
    isExtraDeck: dbRow.is_extra_deck,

    spellEffectType: dbRow.spell_effect_type,
    trapEffectType: dbRow.trap_effect_type
  } as Card
}

/**
 * Get a card by ID
 * @param cardId - The card ID
 * @param env - The environment variables
 * @returns Card object or null if not found
 */
export async function getCardById(cardId: string, env: Env): Promise<Card | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM cards WHERE card_id = ?'
  ).bind(cardId).first()

  if (!result) return null

  return mapCardDbToApi(result)
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
