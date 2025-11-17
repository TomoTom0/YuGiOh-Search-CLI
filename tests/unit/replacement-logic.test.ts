import { describe, it, expect } from 'vitest'
import { MOCK_CARD_DATA } from '../fixtures/mock-data'

// Test replacement logic without actual search
function processReplacement(query: string, results: any[]): {
  replacement: string
  status: 'resolved' | 'multiple' | 'notfound'
} {
  if (results.length === 1) {
    const card = results[0]
    return {
      replacement: `{{${card.name}|${card.cardId}}}`,
      status: 'resolved'
    }
  } else if (results.length > 1) {
    const candidatesStr = results
      .map((card: any) => `\`${card.name}|${card.cardId}\``)
      .join('_')
    return {
      replacement: `{{\`${query}\`_${candidatesStr}}}`,
      status: 'multiple'
    }
  } else {
    return {
      replacement: `{{NOTFOUND_\`${query}\`}}`,
      status: 'notfound'
    }
  }
}

describe('Replacement Logic (Unit)', () => {
  it('should replace single match correctly', () => {
    const card = MOCK_CARD_DATA.find(c => c.cardId === '4007')!
    const result = processReplacement('青眼の白龍', [card])
    
    expect(result.status).toBe('resolved')
    expect(result.replacement).toBe('{{青眼の白龍|4007}}')
  })

  it('should format multiple matches with backticks', () => {
    const cards = MOCK_CARD_DATA.filter(c => c.name === '青眼の白龍')
    const result = processReplacement('青眼の白龍', cards)
    
    expect(result.status).toBe('multiple')
    expect(result.replacement).toContain('`青眼の白龍`')
    expect(result.replacement).toMatch(/\{\{`[^`]+`_`[^`]+\|[^`]+`/)
  })

  it('should format not found with NOTFOUND marker', () => {
    const result = processReplacement('NonExistent', [])
    
    expect(result.status).toBe('notfound')
    expect(result.replacement).toBe('{{NOTFOUND_`NonExistent`}}')
  })

  it('should separate multiple candidates with underscore', () => {
    const cards = MOCK_CARD_DATA.filter(c => c.name.includes('青眼')).slice(0, 3)
    const result = processReplacement('青眼*', cards)
    
    expect(result.status).toBe('multiple')
    const underscoreCount = (result.replacement.match(/_/g) || []).length
    expect(underscoreCount).toBe(cards.length) // One _ before candidates, rest between
  })

  it('should use backticks to distinguish from card names with underscores', () => {
    const mockCard = { name: 'Card_With_Underscore', cardId: '99999' }
    const result = processReplacement('test', [mockCard, mockCard])
    
    expect(result.replacement).toMatch(/`Card_With_Underscore\|99999`/)
    // Backticks should wrap the entire name|id pair
  })
})

describe('Replacement Status Detection (Unit)', () => {
  it('should detect resolved status', () => {
    const result = processReplacement('test', [MOCK_CARD_DATA[0]])
    expect(result.status).toBe('resolved')
  })

  it('should detect multiple status', () => {
    const result = processReplacement('test', [MOCK_CARD_DATA[0], MOCK_CARD_DATA[1]])
    expect(result.status).toBe('multiple')
  })

  it('should detect notfound status', () => {
    const result = processReplacement('test', [])
    expect(result.status).toBe('notfound')
  })
})

describe('Warning Generation (Unit)', () => {
  function generateWarnings(statuses: Array<'resolved' | 'multiple' | 'notfound'>): string[] {
    const warnings: string[] = []
    const hasUnprocessed = statuses.some(s => s === 'multiple' || s === 'notfound')
    
    if (!hasUnprocessed) return warnings
    
    warnings.push('⚠️ Text contains unprocessed patterns that require manual review')
    
    const notfoundCount = statuses.filter(s => s === 'notfound').length
    const multipleCount = statuses.filter(s => s === 'multiple').length
    
    if (notfoundCount > 0) {
      warnings.push(`Found ${notfoundCount} pattern(s) with no matches (NOTFOUND_*)`)
    }
    if (multipleCount > 0) {
      warnings.push(`Found ${multipleCount} pattern(s) with multiple matches - please select correct one`)
    }
    
    return warnings
  }

  it('should generate no warnings for all resolved', () => {
    const warnings = generateWarnings(['resolved', 'resolved'])
    expect(warnings).toHaveLength(0)
  })

  it('should generate warning for multiple matches', () => {
    const warnings = generateWarnings(['multiple'])
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.includes('multiple matches'))).toBe(true)
  })

  it('should generate warning for not found', () => {
    const warnings = generateWarnings(['notfound'])
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.includes('no matches'))).toBe(true)
  })

  it('should generate combined warnings', () => {
    const warnings = generateWarnings(['notfound', 'multiple', 'resolved'])
    expect(warnings.length).toBeGreaterThan(2)
    expect(warnings.some(w => w.includes('no matches'))).toBe(true)
    expect(warnings.some(w => w.includes('multiple matches'))).toBe(true)
  })
})
