import { describe, it, expect } from 'vitest'

// Test pattern extraction logic without requiring actual search
function extractCardPatterns(text: string): Array<{pattern: string, type: 'flexible' | 'exact' | 'cardId', query: string}> {
  const patterns: Array<{pattern: string, type: 'flexible' | 'exact' | 'cardId', query: string}> = []
  const usedPositions = new Set<number>()
  
  // Pattern 1: {{card-name|cid}} - cardId search
  const cardIdPattern = /\{\{([^|]+)\|([^}]+)\}\}/g
  let match: RegExpExecArray | null
  while ((match = cardIdPattern.exec(text)) !== null) {
    patterns.push({
      pattern: match[0],
      type: 'cardId',
      query: match[2].trim()
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

describe('Pattern Extraction (Unit)', () => {
  it('should extract flexible pattern', () => {
    const patterns = extractCardPatterns('Use {青眼の白龍} in deck')
    
    expect(patterns).toHaveLength(1)
    expect(patterns[0]).toEqual({
      pattern: '{青眼の白龍}',
      type: 'flexible',
      query: '青眼の白龍'
    })
  })

  it('should extract exact pattern', () => {
    const patterns = extractCardPatterns('Use 《青眼の白龍》 card')
    
    expect(patterns).toHaveLength(1)
    expect(patterns[0]).toEqual({
      pattern: '《青眼の白龍》',
      type: 'exact',
      query: '青眼の白龍'
    })
  })

  it('should extract cardId pattern', () => {
    const patterns = extractCardPatterns('Use {{青眼の白龍|4007}} in combo')
    
    expect(patterns).toHaveLength(1)
    expect(patterns[0]).toEqual({
      pattern: '{{青眼の白龍|4007}}',
      type: 'cardId',
      query: '4007'
    })
  })

  it('should extract multiple patterns in correct priority', () => {
    const patterns = extractCardPatterns('Use {flexible} and 《exact》 and {{name|4007}}')
    
    expect(patterns).toHaveLength(3)
    expect(patterns[0].type).toBe('cardId')
    expect(patterns[1].type).toBe('exact')
    expect(patterns[2].type).toBe('flexible')
  })

  it('should not extract nested patterns', () => {
    const patterns = extractCardPatterns('Use {{name|4007}} not {inside}')
    
    expect(patterns).toHaveLength(2)
    expect(patterns[0].type).toBe('cardId')
    expect(patterns[1].type).toBe('flexible')
  })

  it('should handle empty text', () => {
    const patterns = extractCardPatterns('')
    expect(patterns).toHaveLength(0)
  })

  it('should handle text with no patterns', () => {
    const patterns = extractCardPatterns('Just plain text')
    expect(patterns).toHaveLength(0)
  })

  it('should trim whitespace from queries', () => {
    const patterns = extractCardPatterns('Use { card name } here')
    
    expect(patterns).toHaveLength(1)
    expect(patterns[0].query).toBe('card name')
  })

  it('should handle wildcard in flexible patterns', () => {
    const patterns = extractCardPatterns('Search {ブルーアイズ*} cards')
    
    expect(patterns).toHaveLength(1)
    expect(patterns[0].query).toBe('ブルーアイズ*')
  })

  it('should handle multiple wildcards', () => {
    const patterns = extractCardPatterns('Use {Evil*Twin*} deck')
    
    expect(patterns).toHaveLength(1)
    expect(patterns[0].query).toBe('Evil*Twin*')
  })
})
