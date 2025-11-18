#!/usr/bin/env node
import { spawn } from 'child_process'
import path from 'path'
import url from 'url'
import type { Card, CardMatch, PatternType } from './types/card'
import { extractCardPatterns } from './utils/pattern-extractor.js'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const searchScript = path.join(__dirname, 'search-cards.js')

interface SearchResult {
  cards: CardMatch[]
}

// Execute search for a single pattern
async function searchCard(pattern: {pattern: string, type: PatternType, query: string}): Promise<CardMatch> {
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
          type: pattern.type,
          query: pattern.query,
          results: result
        })
      } catch (e) {
        resolve({
          pattern: pattern.pattern,
          type: pattern.type,
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
  
  // Output as JSONL (single object on one line)
  console.log(JSON.stringify(result))
}

main().catch(e => {
  console.error(e)
  process.exit(2)
})
