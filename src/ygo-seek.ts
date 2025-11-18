#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import url from 'url'
import readline from 'readline'

interface SeekOptions {
  max: number
  random: boolean
  range?: [number, number]
  all: boolean
  cols: string[]
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
      const maxValue = arg.includes('=') ? arg.split('=')[1] : args[++i]
      options.max = parseInt(maxValue)
    } else if (arg === '--no-random') {
      options.random = false
    } else if (arg === '--random') {
      options.random = true
    } else if (arg.startsWith('--range')) {
      const rangeValue = arg.includes('=') ? arg.split('=')[1] : args[++i]
      const [start, end] = rangeValue.split('-').map(Number)
      if (isNaN(start) || isNaN(end)) {
        console.error(`Invalid range: ${rangeValue}`)
        process.exit(2)
      }
      options.range = [start, end]
    } else if (arg === '--all') {
      options.all = true
    } else if (arg.startsWith('--col')) {
      const colValue = arg.includes('=') ? arg.split('=')[1] : args[++i]
      options.cols = colValue.split(',')
    } else if (arg.startsWith('--format')) {
      const formatValue = arg.includes('=') ? arg.split('=')[1] : args[++i]
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
  let projectRoot = __dirname
  while (true) {
    if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
      const pkg = JSON.parse(await fs.promises.readFile(path.join(projectRoot, 'package.json'), 'utf8'))
      if (pkg.name === 'ygo-search-card-mcp') {
        break
      }
    }
    const parentDir = path.dirname(projectRoot)
    if (parentDir === projectRoot) {
      throw new Error('Could not find project root')
    }
    projectRoot = parentDir
  }
  
  const dataDir = path.join(projectRoot, 'data')
  const cardsFile = path.join(dataDir, 'cards-all.tsv')
  
  if (!fs.existsSync(cardsFile)) {
    console.error(`Data file not found: ${cardsFile}`)
    process.exit(2)
  }
  
  // Read cards
  const rl = readline.createInterface({ 
    input: fs.createReadStream(cardsFile), 
    crlfDelay: Infinity 
  })
  
  let headers: string[] = []
  const allCards: Record<string, string>[] = []
  
  for await (const line of rl) {
    if (!line) continue
    
    if (headers.length === 0) {
      headers = line.split('\t')
      continue
    }
    
    const values = line.split('\t')
    const card: Record<string, string> = {}
    
    for (let i = 0; i < headers.length; i++) {
      card[headers[i]] = values[i] || ''
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
