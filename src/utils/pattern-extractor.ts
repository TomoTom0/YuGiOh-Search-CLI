import type { ExtractedPattern, PatternType } from '../types/card'

export interface ExtractOptions {
  includeStartIndex?: boolean
}

/**
 * Extract card name patterns from text
 * Supports {card-name} (flexible), 《card-name》 (exact), and {{card-name|cardId}} (by ID)
 * 
 * @param text Text containing card name patterns
 * @param options Options for extraction
 * @returns Array of extracted patterns
 */
export function extractCardPatterns(text: string, options: ExtractOptions = {}): ExtractedPattern[] {
  const patterns: ExtractedPattern[] = []
  const usedPositions = new Set<number>()
  
  // Pattern 1: {{card-name|cid}} - already processed / cardId search
  const cardIdPattern = /\{\{([^|]+)\|([^}]+)\}\}/g
  let match: RegExpExecArray | null
  
  while ((match = cardIdPattern.exec(text)) !== null) {
    const extracted: ExtractedPattern = {
      pattern: match[0],
      type: 'cardId' as PatternType,
      query: match[2].trim()
    }
    
    if (options.includeStartIndex) {
      extracted.startIndex = match.index
    }
    
    patterns.push(extracted)
    
    for (let i = match.index; i < match.index + match[0].length; i++) {
      usedPositions.add(i)
    }
  }
  
  // Pattern 2: 《card-name》 - exact name search
  const exactPattern = /《([^》]+)》/g
  while ((match = exactPattern.exec(text)) !== null) {
    if (usedPositions.has(match.index)) continue
    
    const extracted: ExtractedPattern = {
      pattern: match[0],
      type: 'exact' as PatternType,
      query: match[1].trim()
    }
    
    if (options.includeStartIndex) {
      extracted.startIndex = match.index
    }
    
    patterns.push(extracted)
    
    for (let i = match.index; i < match.index + match[0].length; i++) {
      usedPositions.add(i)
    }
  }
  
  // Pattern 3: {card-name} - flexible name search
  const flexiblePattern = /\{([^}]+)\}/g
  while ((match = flexiblePattern.exec(text)) !== null) {
    if (usedPositions.has(match.index)) continue
    
    const extracted: ExtractedPattern = {
      pattern: match[0],
      type: 'flexible' as PatternType,
      query: match[1].trim()
    }
    
    if (options.includeStartIndex) {
      extracted.startIndex = match.index
    }
    
    patterns.push(extracted)
    
    for (let i = match.index; i < match.index + match[0].length; i++) {
      usedPositions.add(i)
    }
  }
  
  return patterns
}
