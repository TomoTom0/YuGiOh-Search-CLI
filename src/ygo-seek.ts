#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import url from 'url'
import readline from 'readline'
import { findProjectRoot } from './utils/project-root.js'

interface SeekOptions {
  max: number
  random: boolean
  range?: [number, number]
  all: boolean
  cols: string[]
  colAll: boolean
  format: 'json' | 'csv' | 'tsv' | 'jsonl'
}

async function main() {
  const args = process.argv.slice(2)
  
  // Parse options
  const options: SeekOptions = {
    max: 10,
    random: true,
    all: false,
    cols: ['cardId', 'name'],
    colAll: false,
    format: 'json'
  }
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    
    if (arg === '--help' || arg === '-h') {
      console.log(`Usage: ygo_seek [options]

Retrieve random or specific card information from the database.

Options:
  --max N             Maximum number of cards to return (default: 10)
  --random            Randomly select cards (default: true)
  --no-random         Disable random selection
  --range start-end   Specify cardId range (e.g., --range 4000-5000)
  --all               Get all cards in range (overrides --max, requires --range)
  --col a,b,c         Columns to retrieve (default: cardId,name)
  --col-all           Include all columns (overrides --col)
  --format FORMAT     Output format: json|csv|tsv|jsonl (default: json)

Examples:
  ygo_seek
  ygo_seek --max 5
  ygo_seek --range 4000-4100 --max 20
  ygo_seek --range 4000-4100 --all
  ygo_seek --col cardId,name,atk,def --format csv
`)
      process.exit(0)
    } else if (arg.startsWith('--max')) {
      const maxValue = arg.includes('=') ? arg.split('=')[1] : args[i + 1]
      if (!maxValue || maxValue.startsWith('--')) {
        console.error('Error: Missing value for --max option')
        process.exit(2)
      }
      if (!arg.includes('=')) i++
      options.max = parseInt(maxValue)
    } else if (arg === '--no-random') {
      options.random = false
    } else if (arg === '--random') {
      options.random = true
    } else if (arg.startsWith('--range')) {
      const rangeValue = arg.includes('=') ? arg.split('=')[1] : args[i + 1]
      if (!rangeValue || rangeValue.startsWith('--')) {
        console.error('Error: Missing value for --range option')
        process.exit(2)
      }
      if (!arg.includes('=')) i++
      const [start, end] = rangeValue.split('-').map(Number)
      if (isNaN(start) || isNaN(end)) {
        console.error(`Invalid range: ${rangeValue}`)
        process.exit(2)
      }
      options.range = [start, end]
    } else if (arg === '--all') {
      options.all = true
    } else if (arg === '--col-all') {
      options.colAll = true
    } else if (arg.startsWith('--col')) {
      const colValue = arg.includes('=') ? arg.split('=')[1] : args[i + 1]
      if (!colValue || colValue.startsWith('--')) {
        console.error('Error: Missing value for --col option')
        process.exit(2)
      }
      if (!arg.includes('=')) i++
      options.cols = colValue.split(',')
    } else if (arg.startsWith('--format')) {
      const formatValue = arg.includes('=') ? arg.split('=')[1] : args[i + 1]
      if (!formatValue || formatValue.startsWith('--')) {
        console.error('Error: Missing value for --format option')
        process.exit(2)
      }
      if (!arg.includes('=')) i++
      const format = formatValue as SeekOptions['format']
      if (!['json', 'csv', 'tsv', 'jsonl'].includes(format)) {
        console.error(`Invalid format: ${format}`)
        process.exit(2)
      }
      options.format = format
    }
  }
  
  // Validate options
  if (options.all && !options.range) {
    console.error('--all requires --range')
    process.exit(2)
  }
  
  // Find project root
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
  const projectRoot = await findProjectRoot(__dirname)
  
  const dataDir = path.join(projectRoot, 'data')
  const cardsFile = path.join(dataDir, 'cards-all.tsv')
  const detailFile = path.join(dataDir, 'detail-all.tsv')
  
  if (!fs.existsSync(cardsFile)) {
    console.error(`Data file not found: ${cardsFile}`)
    process.exit(2)
  }
  
  // Read cards-all.tsv
  const rlCards = readline.createInterface({ 
    input: fs.createReadStream(cardsFile), 
    crlfDelay: Infinity 
  })
  
  let cardsHeaders: string[] = []
  const allCards: Record<string, string>[] = []
  
  for await (const line of rlCards) {
    if (!line) continue
    
    if (cardsHeaders.length === 0) {
      cardsHeaders = line.split('\t')
      continue
    }
    
    const values = line.split('\t')
    const card: Record<string, string> = {}
    
    for (let i = 0; i < cardsHeaders.length; i++) {
      card[cardsHeaders[i]] = values[i] || ''
    }
    
    // Filter by range if specified
    if (options.range) {
      const cardId = parseInt(card.cardId)
      if (isNaN(cardId) || cardId < options.range[0] || cardId > options.range[1]) {
        continue
      }
    }
    
    allCards.push(card)
  }
  
  // Read detail-all.tsv and merge by cardId
  if (fs.existsSync(detailFile)) {
    const rlDetail = readline.createInterface({ 
      input: fs.createReadStream(detailFile), 
      crlfDelay: Infinity 
    })
    
    let detailHeaders: string[] = []
    const detailMap = new Map<string, Record<string, string>>()
    
    for await (const line of rlDetail) {
      if (!line) continue
      
      if (detailHeaders.length === 0) {
        detailHeaders = line.split('\t')
        continue
      }
      
      const values = line.split('\t')
      const detail: Record<string, string> = {}
      let cardId = ''
      
      for (let i = 0; i < detailHeaders.length; i++) {
        const header = detailHeaders[i]
        detail[header] = values[i] || ''
        if (header === 'cardId') {
          cardId = values[i]
        }
      }
      
      if (cardId) {
        detailMap.set(cardId, detail)
      }
    }
    
    // Merge detail info into cards (skip duplicate columns)
    for (const card of allCards) {
      const detail = detailMap.get(card.cardId)
      if (detail) {
        for (const [key, value] of Object.entries(detail)) {
          // Skip if column already exists in card (avoid duplicates)
          if (!card.hasOwnProperty(key)) {
            card[key] = value
          }
        }
      }
    }
    
    // Update available columns for --col-all
    if (options.colAll) {
      // Get all unique column names from merged data
      const allColumnNames = new Set<string>()
      cardsHeaders.forEach(h => allColumnNames.add(h))
      detailHeaders.forEach(h => allColumnNames.add(h))
      options.cols = Array.from(allColumnNames)
    }
  } else {
    // If detail file doesn't exist, just use cards headers
    if (options.colAll) {
      options.cols = cardsHeaders
    }
  }
  
  // Select cards
  let selectedCards: Record<string, string>[]
  
  if (options.all) {
    selectedCards = allCards
  } else if (options.random) {
    // Random selection
    const count = Math.min(options.max, allCards.length)
    selectedCards = []
    const indices = new Set<number>()
    
    while (indices.size < count) {
      indices.add(Math.floor(Math.random() * allCards.length))
    }
    
    for (const idx of indices) {
      selectedCards.push(allCards[idx])
    }
  } else {
    // Take first N cards
    selectedCards = allCards.slice(0, options.max)
  }
  
  // Filter columns
  const result = selectedCards.map(card => {
    const filtered: Record<string, string> = {}
    for (const col of options.cols) {
      filtered[col] = card[col] || ''
    }
    return filtered
  })
  
  // Output in specified format
  switch (options.format) {
    case 'json':
      console.log(JSON.stringify(result, null, 2))
      break
      
    case 'jsonl':
      for (const item of result) {
        console.log(JSON.stringify(item))
      }
      break
      
    case 'csv':
      // CSV header
      console.log(options.cols.map(col => `"${col}"`).join(','))
      // CSV rows
      for (const item of result) {
        console.log(options.cols.map(col => {
          const val = item[col] || ''
          return `"${val.replace(/"/g, '""')}"`
        }).join(','))
      }
      break
      
    case 'tsv':
      // TSV header
      console.log(options.cols.join('\t'))
      // TSV rows
      for (const item of result) {
        console.log(options.cols.map(col => item[col] || '').join('\t'))
      }
      break
  }
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
