#!/usr/bin/env node
// Bulk search wrapper for search-cards.ts
import { spawn } from 'child_process'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const searchScript = path.join(__dirname, 'search-cards.js')

interface QueryParams {
  filter: Record<string, any>
  cols?: string[]
  mode?: string
  includeRuby?: boolean
  flagAutoPend?: boolean
  flagAutoSupply?: boolean
  flagAutoModify?: boolean
  flagAllowWild?: boolean
  flagNearly?: boolean
}

async function executeQuery(query: QueryParams): Promise<any[]> {
  const args = [JSON.stringify(query.filter)]
  
  if (query.cols && query.cols.length > 0) {
    args.push(`cols=${query.cols.join(',')}`)
  }
  if (query.mode) {
    args.push(`mode=${query.mode}`)
  }
  if (query.includeRuby === false) {
    args.push(`includeRuby=false`)
  }
  if (query.flagAutoPend === false) {
    args.push(`flagAutoPend=false`)
  }
  if (query.flagAutoSupply === false) {
    args.push(`flagAutoSupply=false`)
  }
  if (query.flagAutoModify === false) {
    args.push(`flagAutoModify=false`)
  }
  if (query.flagAllowWild === false) {
    args.push(`flagAllowWild=false`)
  }
  if (query.flagNearly === true) {
    args.push(`flagNearly=true`)
  }
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', [searchScript, ...args], {
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
        // Return empty array on error instead of failing
        resolve([])
        return
      }
      
      try {
        if (!stdout.trim()) {
          resolve([])
          return
        }
        const lines = stdout.trim().split('\n')
        const result = lines.map(line => JSON.parse(line))
        resolve(result)
      } catch (e) {
        resolve([])
      }
    })
    
    child.on('error', () => {
      resolve([])
    })
  })
}

async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.error('Usage: bulk-search-cards.ts \'[{query1}, {query2}, ...]\'')
    process.exit(2)
  }
  
  let queries: QueryParams[]
  try {
    queries = JSON.parse(args[0])
    if (!Array.isArray(queries)) {
      throw new Error('Queries must be an array')
    }
  } catch (e) {
    console.error('Invalid queries JSON:', e instanceof Error ? e.message : e)
    process.exit(2)
  }
  
  if (queries.length === 0) {
    // No output for empty queries
    return
  }
  
  if (queries.length > 50) {
    console.error('Maximum 50 queries allowed')
    process.exit(2)
  }
  
  // Execute all queries
  const results = await Promise.all(queries.map(q => executeQuery(q)))
  
  // Output as JSONL (one result array per line)
  results.forEach(result => {
    console.log(JSON.stringify(result))
  })
}

main().catch(e => {
  console.error(e)
  process.exit(2)
})
