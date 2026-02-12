/**
 * Filter parsing and SQL WHERE clause building for worker API endpoints
 */

import { normalizeForSearch } from '../shared/normalizer.js'
import { parseSearchQuery, type ParsedSearchQuery } from '../shared/search-parser.js'

export interface NormalizedFilter {
  op: 'and' | 'or'
  cond: any[]
}

/**
 * Parse filter parameters from URL search params
 * Supports both simple and complex filter formats:
 * - Simple: ?filter[name]=value
 * - OR condition: ?filter[name][or][]=value1&filter[name][or][]=value2
 * - AND condition: ?filter[name][and][]=value1&filter[name][and][]=value2
 *
 * @param searchParams - URL search parameters
 * @returns Parsed filter object
 */
export function parseFilterParams(searchParams: URLSearchParams): Record<string, NormalizedFilter> {
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
 *
 * @param filter - Normalized filter object
 * @param mode - Search mode ('exact' or 'partial')
 * @param flagAutoModify - Enable text normalization
 * @param flagAllowWild - Allow wildcard (*) in queries
 * @param includeRuby - Include ruby (furigana) search
 * @returns Tuple of [whereClause, bindParams, parsedTextQuery]
 */
export function buildWhereClause(
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
