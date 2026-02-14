/**
 * Card pattern extraction and search for worker API endpoints
 */

import type { Env } from '../../worker.js'
import { normalizeForSearch } from '../shared/normalizer.js'
import { mapCardDbToApi } from './database.js'

export interface ExtractedPattern {
  pattern: string
  type: 'cardId' | 'exact' | 'flexible'
  query: string
  originalName?: string
}

export interface ExtractedPatternWithIndex extends ExtractedPattern {
  startIndex: number
}

/**
 * Extract card name patterns from text
 * Supports {card-name} (flexible), 《card-name》 (exact), and {{card-name|cardId}} (by ID)
 *
 * @param text - Input text containing card patterns
 * @returns Array of extracted patterns
 */
export function extractCardPatterns(text: string): ExtractedPattern[] {
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
 * Extract card patterns with start index
 *
 * @param text - Input text containing card patterns
 * @returns Array of extracted patterns with start index
 */
export function extractCardPatternsWithIndex(text: string): ExtractedPatternWithIndex[] {
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

/**
 * Search a single card pattern
 *
 * @param pattern - Extracted pattern to search
 * @param env - The environment variables
 * @returns Array of matching cards
 */
export async function searchCardPattern(pattern: ExtractedPattern, env: Env): Promise<any> {
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
        // Flexible search: allow wildcards, but exact match without wildcard (matching ts-cli behavior)
        if (hasWildcard) {
          const sqlPattern = normalizedQuery.split('*').join('%')
          sqlQuery = `SELECT ${selectCols} FROM cards WHERE normalized_name LIKE ? LIMIT 10`
          bindParams = [sqlPattern]
        } else {
          // Without wildcard, use exact match (same as ts-cli)
          sqlQuery = `SELECT ${selectCols} FROM cards WHERE normalized_name = ? LIMIT 10`
          bindParams = [normalizedQuery]
        }
      } else {
        // Exact search
        sqlQuery = `SELECT ${selectCols} FROM cards WHERE normalized_name = ? LIMIT 10`
        bindParams = [normalizedQuery]
      }
    }

    const result = await env.DB.prepare(sqlQuery).bind(...bindParams).all()
    return (result.results || []).map(mapCardDbToApi)
  } catch (e) {
    console.error('Search card pattern error:', e)
    return []
  }
}
