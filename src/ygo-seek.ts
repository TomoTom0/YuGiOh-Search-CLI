#!/usr/bin/env node
import { seekCards } from './lib/seek-cards.js'

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

  // Seek cards using the library function
  const result = await seekCards({
    max: options.max,
    random: options.random,
    range: options.range,
    all: options.all,
    cols: options.cols,
    colAll: options.colAll
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
