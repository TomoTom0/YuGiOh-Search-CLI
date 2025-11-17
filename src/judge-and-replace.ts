#!/usr/bin/env node
import { spawn } from 'child_process'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const searchScript = path.join(__dirname, 'search-cards.ts')

interface CardMatch {
  pattern: string
  type: 'flexible' | 'exact' | 'cardId'
  query: string
  results: any[]
}

interface ReplaceResult {
  processedText: string
  hasUnprocessed: boolean
  warnings: string[]
  processedPatterns: Array<{
    original: string
    replaced: string
    status: 'resolved' | 'multiple' | 'notfound' | 'already_processed'
  }>
}

// Parse text and extract card name patterns (same as extract-and-search)
function extractCardPatterns(text: string): Array<{pattern: string, type: 'flexible' | 'exact' | 'cardId', query: string, startIndex: number}> {
  const patterns: Array<{pattern: string, type: 'flexible' | 'exact' | 'cardId', query: string, startIndex: number}> = []
  const usedPositions = new Set<number>()
  
  // Pattern 1: {{card-name|cid}} - already processed
  const cardIdPattern = /\{\{([^|]+)\|([^}]+)\}\}/g
  let match: RegExpExecArray | null
  while ((match = cardIdPattern.exec(text)) !== null) {
    patterns.push({
      pattern: match[0],
      type: 'cardId',
      query: match[2].trim(),
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
  
  return patterns.sort((a, b) => a.startIndex - b.startIndex)
}

// Execute search for a single pattern
async function searchCard(pattern: {pattern: string, type: string, query: string}): Promise<CardMatch> {
  const args: string[] = []
  
  if (pattern.type === 'cardId') {
    args.push(JSON.stringify({ cardId: pattern.query }))
  } else {
    args.push(JSON.stringify({ name: pattern.query }))
  }
  
  const cols = [
    'cardType', 'name', 'ruby', 'cardId', 'ciid', 'imgs',
    'text', 'attribute', 'levelType', 'levelValue', 'race', 'monsterTypes',
    'atk', 'def', 'linkMarkers', 'pendulumScale', 'pendulumText',
    'isExtraDeck', 'spellEffectType', 'trapEffectType',
    'supplementInfo', 'supplementDate', 'pendulumSupplementInfo', 'pendulumSupplementDate'
  ]
  args.push(`cols=${cols.join(',')}`)
  
  if (pattern.type === 'flexible') {
    args.push('flagAllowWild=true')
    args.push('flagAutoModify=true')
  } else if (pattern.type === 'exact') {
    args.push('flagAllowWild=false')
    args.push('flagAutoModify=true')
  }
  
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', searchScript, ...args], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
    
    let stdout = ''
    let stderr = ''
    
    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })
    
    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })
    
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          pattern: pattern.pattern,
          type: pattern.type as any,
          query: pattern.query,
          results: []
        })
        return
      }
      
      try {
        const result = JSON.parse(stdout)
        resolve({
          pattern: pattern.pattern,
          type: pattern.type as any,
          query: pattern.query,
          results: result
        })
      } catch (e) {
        resolve({
          pattern: pattern.pattern,
          type: pattern.type as any,
          query: pattern.query,
          results: []
        })
      }
    })
    
    child.on('error', () => {
      resolve({
        pattern: pattern.pattern,
        type: pattern.type as any,
        query: pattern.query,
        results: []
      })
    })
  })
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.error('Usage: judge-and-replace.ts <text>')
    console.error('Example: judge-and-replace.ts "I use {ブルーアイズ*} and 《青眼の白龍》 cards"')
    process.exit(2)
  }
  
  const text = args[0]
  const patterns = extractCardPatterns(text)
  
  if (patterns.length === 0) {
    console.log(JSON.stringify({
      processedText: text,
      hasUnprocessed: false,
      warnings: [],
      processedPatterns: []
    } as ReplaceResult, null, 2))
    return
  }
  
  // Search all patterns
  const searchResults = await Promise.all(patterns.map(p => searchCard(p)))
  
  // Build result
  const result: ReplaceResult = {
    processedText: text,
    hasUnprocessed: false,
    warnings: [],
    processedPatterns: []
  }
  
  // Process replacements in reverse order to maintain indices
  const sortedResults = searchResults
    .map((sr, idx) => ({ ...sr, startIndex: patterns[idx].startIndex }))
    .sort((a, b) => b.startIndex - a.startIndex)
  
  for (const match of sortedResults) {
    if (match.type === 'cardId') {
      // Already processed format
      result.processedPatterns.push({
        original: match.pattern,
        replaced: match.pattern,
        status: 'already_processed'
      })
      continue
    }
    
    const resultCount = match.results.length
    
    if (resultCount === 1) {
      // Exactly one result - replace with {{name|cardId}}
      const card = match.results[0]
      const replacement = `{{${card.name}|${card.cardId}}}`
      result.processedText = result.processedText.substring(0, match.startIndex) + 
                            replacement + 
                            result.processedText.substring(match.startIndex + match.pattern.length)
      
      result.processedPatterns.push({
        original: match.pattern,
        replaced: replacement,
        status: 'resolved'
      })
    } else if (resultCount > 1) {
      // Multiple results - format as {{`original`_`name|id`_`name|id`_...}}
      const candidatesStr = match.results
        .map((card: any) => `\`${card.name}|${card.cardId}\``)
        .join('_')
      const replacement = `{{\`${match.query}\`_${candidatesStr}}}`
      result.processedText = result.processedText.substring(0, match.startIndex) + 
                            replacement + 
                            result.processedText.substring(match.startIndex + match.pattern.length)
      
      result.processedPatterns.push({
        original: match.pattern,
        replaced: replacement,
        status: 'multiple'
      })
      result.hasUnprocessed = true
    } else {
      // No results - format as {{NOTFOUND_`original`}}
      const replacement = `{{NOTFOUND_\`${match.query}\`}}`
      result.processedText = result.processedText.substring(0, match.startIndex) + 
                            replacement + 
                            result.processedText.substring(match.startIndex + match.pattern.length)
      
      result.processedPatterns.push({
        original: match.pattern,
        replaced: replacement,
        status: 'notfound'
      })
      result.hasUnprocessed = true
    }
  }
  
  // Check for unprocessed markers
  if (result.hasUnprocessed) {
    result.warnings.push('⚠️ Text contains unprocessed patterns that require manual review')
    
    const notfoundCount = result.processedPatterns.filter(p => p.status === 'notfound').length
    const multipleCount = result.processedPatterns.filter(p => p.status === 'multiple').length
    
    if (notfoundCount > 0) {
      result.warnings.push(`Found ${notfoundCount} pattern(s) with no matches (NOTFOUND_*)`)
    }
    if (multipleCount > 0) {
      result.warnings.push(`Found ${multipleCount} pattern(s) with multiple matches - please select correct one`)
    }
  }
  
  console.log(JSON.stringify(result, null, 2))
}

main().catch(e => {
  console.error(e)
  process.exit(2)
})
