/**
 * Validation utilities for worker API endpoints
 */

export const MAX_LIMIT = 100
export const MAX_OFFSET = 1000
export const MAX_BULK_QUERIES = 50

/**
 * Validate search parameters
 * @param limit - Maximum number of results
 * @param offset - Result offset
 * @param mode - Search mode ('exact' or 'partial')
 * @returns Array of error messages (empty if valid)
 */
export function validateSearchParams(limit: number, offset: number, mode: string): string[] {
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
 * Validate sort parameter
 * @param sort - Sort parameter string (field:order format)
 * @returns Object with sortField, sortOrder, or error message
 */
export function validateSortParam(sort: string): { sortField?: string; sortOrder?: 'ASC' | 'DESC'; error?: string } {
  const sortParts = sort.split(':')
  const sortField = sortParts[0]
  const sortOrder = (sortParts[1]?.toUpperCase() === 'DESC') ? 'DESC' : 'ASC'

  const validSortFields = ['card_id', 'name', 'ruby', 'atk', 'def', 'level', 'attribute', 'race', 'card_type']
  if (!validSortFields.includes(sortField)) {
    return {
      error: `Invalid sort field "${sortField}". Valid fields: ${validSortFields.join(', ')}`
    }
  }

  return { sortField, sortOrder }
}
