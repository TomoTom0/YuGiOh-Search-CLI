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

interface SearchResult {
  cards: CardMatch[]
}

// Parse text and extract card name patterns
function extractCardPatterns(text: string): Array<{pattern: string, type: 'flexible' | 'exact' | 'cardId', query: string}> {
  const patterns: Array<{pattern: string, type: 'flexible' | 'exact' | 'cardId', query: string}> = []
  const usedPositions = new Set<number>()
  
  // Pattern 1: {{card-name|cid}} - cardId search (must be checked first)
  const cardIdPattern = /\{\{([^|]+)\|([^}]+)\}\}/g
  let match: RegExpExecArray | null
  while ((match = cardIdPattern.exec(text)) !== null) {
    patterns.push({
      pattern: match[0],
      type: 'cardId',
      query: match[2].trim()
    })
    // Mark positions as used
    for (let i = match.index; i < match.index + match[0].length; i++) {
      usedPositions.add(i)
    }
  }
  
  // Pattern 2: 《card-name》 - exact name search
  const exactPattern = /《([^》]+)》/g
  while ((match = exactPattern.exec(text)) !== null) {
    // Check if this position is already used
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
    // Check if this position is already used (inside {{...}})
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

// Execute search for a single pattern
async function searchCard(pattern: {pattern: string, type: string, query: string}): Promise<CardMatch> {
  const args: string[] = []
  
  if (pattern.type === 'cardId') {
    args.push(JSON.stringify({ cardId: pattern.query }))
  } else {
    args.push(JSON.stringify({ name: pattern.query }))
  }
  
  // Include all important columns
  const cols = [
    'cardType', 'name', 'ruby', 'cardId', 'ciid', 'imgs',
    'text', 'attribute', 'levelType', 'levelValue', 'race', 'monsterTypes',
    'atk', 'def', 'linkMarkers', 'pendulumScale', 'pendulumText',
    'isExtraDeck', 'spellEffectType', 'trapEffectType',
    'supplementInfo', 'supplementDate', 'pendulumSupplementInfo', 'pendulumSupplementDate'
  ]
  args.push(`cols=${cols.join(',')}`)
  
  // Set flags based on pattern type
  if (pattern.type === 'flexible') {
    // Use wildcard and normalization
    args.push('flagAllowWild=true')
    args.push('flagAutoModify=true')
  } else if (pattern.type === 'exact') {
    // Use normalization but no wildcard
    args.push('flagAllowWild=false')
    args.push('flagAutoModify=true')
  }
  // cardId search doesn't need these flags
  
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
    console.error('Usage: extract-and-search-cards.ts <text>')
    console.error('Example: extract-and-search-cards.ts "I use {ブルーアイズ*} and 《青眼の白龍》 cards"')
    process.exit(2)
  }
  
  const text = args[0]
  
  // Extract patterns
  const patterns = extractCardPatterns(text)
  
  if (patterns.length === 0) {
    console.log(JSON.stringify({
      cards: []
    }, null, 2))
    return
  }
  
  // Search all patterns
  const cards = await Promise.all(patterns.map(p => searchCard(p)))
  
  const result: SearchResult = {
    cards: cards
  }
  
  console.log(JSON.stringify(result, null, 2))
}

main().catch(e => {
  console.error(e)
  process.exit(2)
})
