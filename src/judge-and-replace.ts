#!/usr/bin/env node
import { spawn } from 'child_process'
import path from 'path'
import url from 'url'
import type { Card, PatternType, ReplacementResult, ReplacementStatus } from './types/card'
import { extractCardPatterns } from './utils/pattern-extractor'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const bulkSearchScript = path.join(__dirname, 'bulk-search-cards.ts')

interface CardMatchWithIndex {
  pattern: string
  type: PatternType
  query: string
  results: Card[]
  startIndex: number
}

// Execute bulk search for all patterns at once (performance improvement)
async function bulkSearchCards(patterns: Array<{type: PatternType, query: string}>): Promise<Card[][]> {
  const cols = [
    'cardType', 'name', 'ruby', 'cardId', 'ciid', 'imgs',
    'text', 'attribute', 'levelType', 'levelValue', 'race', 'monsterTypes',
    'atk', 'def', 'linkMarkers', 'pendulumScale', 'pendulumText',
    'isExtraDeck', 'spellEffectType', 'trapEffectType',
    'supplementInfo', 'supplementDate', 'pendulumSupplementInfo', 'pendulumSupplementDate'
  ]
  
  // Build queries for bulk search
  const queries = patterns.map(pattern => {
    const query: any = {}
    
    if (pattern.type === 'cardId') {
      query.filter = { cardId: pattern.query }
    } else {
      query.filter = { name: pattern.query }
    }
    
    query.cols = cols
    
    if (pattern.type === 'flexible') {
      query.flagAllowWild = true
      query.flagAutoModify = true
    } else if (pattern.type === 'exact') {
      query.flagAllowWild = false
      query.flagAutoModify = true
    }
    
    return query
  })
  
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', bulkSearchScript, JSON.stringify(queries)], {
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
        // Return empty results for all patterns on error
        resolve(patterns.map(() => []))
        return
      }
      
      try {
        const result = JSON.parse(stdout)
        resolve(result)
      } catch (e) {
        resolve(patterns.map(() => []))
      }
    })
    
    child.on('error', () => {
      resolve(patterns.map(() => []))
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
  const patterns = extractCardPatterns(text, { includeStartIndex: true })
  
  if (patterns.length === 0) {
    console.log(JSON.stringify({
      processedText: text,
      hasUnprocessed: false,
      warnings: [],
      processedPatterns: []
    } as ReplacementResult, null, 2))
    return
  }
  
  // Bulk search all patterns at once for better performance
  const searchResults = await bulkSearchCards(patterns)
  
  // Build result
  const result: ReplacementResult = {
    processedText: text,
    hasUnprocessed: false,
    warnings: [],
    processedPatterns: []
  }
  
  // Process replacements in reverse order to maintain indices
  const patternsWithResults: CardMatchWithIndex[] = patterns.map((p, idx) => ({
    pattern: p.pattern,
    type: p.type,
    query: p.query,
    results: searchResults[idx],
    startIndex: p.startIndex!
  }))
  
  const sortedResults = patternsWithResults.sort((a, b) => b.startIndex - a.startIndex)
  
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
        .map((card: Card) => `\`${card.name}|${card.cardId}\``)
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
  
  // Output as JSONL (single object on one line)
  console.log(JSON.stringify(result))
}

main().catch(e => {
  console.error(e)
  process.exit(2)
})
