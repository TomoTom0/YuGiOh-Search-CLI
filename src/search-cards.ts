#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import url from 'url'
import { findProjectRoot } from './utils/project-root.js'

// Usage:
// Single mode: node search-cards.ts '{"name":"アシスト"}' cols=name,cardId mode=exact
// Bulk mode: node search-cards.ts --bulk '[{"filter":{"name":"青眼"},"cols":["name"]},{"filter":{"name":"ブラマジ"},"cols":["name"]}]'
// mode: exact (default) | partial
// includeRuby: true (default) | false - when true, searches both name and ruby fields for name filter
// flagAutoPend: true (default) | false - when true and cols includes 'text', automatically includes pendulumText/pendulumSupplementInfo for pendulum monsters
// flagAutoSupply: true (default) | false - when true and cols includes 'text', automatically includes supplementInfo (always, even if empty)
// flagAutoRuby: true (default) | false - when true and cols includes 'name', automatically includes ruby
// flagAutoModify: true (default) | false - when filtering by name, normalizes input to ignore whitespace, symbols, case, half/full width, hiragana/katakana differences (uses pre-computed nameModified column for efficiency)
// flagAllowWild: true (default) | false - when true, treats * as wildcard (matches any characters) in name and text fields
// flagNearly: false (default) | true - when true, uses fuzzy matching for name search to handle typos and minor variations
// Negative search: Use -(space|　)-"phrase" or -'phrase' or -`phrase` to exclude cards containing the phrase (works with text fields)

import readline from 'readline'

interface QueryParams {
  filter: Record<string, any>
  cols?: string[] | null
  mode?: string
  includeRuby?: boolean
  flagAutoPend?: boolean
  flagAutoSupply?: boolean
  flagAutoRuby?: boolean
  flagAutoModify?: boolean
  flagAllowWild?: boolean
  flagNearly?: boolean
  max?: number
  sort?: string
  raw?: boolean
}

function normalizeForSearch(str: string): string {
  if (!str) return ''
  return str
    // Remove all whitespace (full-width and half-width)
    .replace(/[\s\u3000]+/g, '')
    // Remove common symbols (both full-width and half-width)
    .replace(/[・★☆※‼！？。、,.，．:：;；「」『』【】〔〕（）()［］\[\]｛｝{}〈〉《》〜～~\-－_＿\/／\\＼|｜&＆@＠#＃$＄%％^＾*＊+＋=＝<＜>＞'"\"'""''`´｀]/g, '')
    // Normalize kanji variants: 竜→龍, 剣→劍, etc.
    .replace(/竜/g, '龍')
    .replace(/剣/g, '劍')
    // Convert full-width alphanumeric to half-width
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    // Convert to lowercase
    .toLowerCase()
    // Convert hiragana to katakana
    .replace(/[\u3041-\u3096]/g, (s) => String.fromCharCode(s.charCodeAt(0) + 0x60))
}

// Parse negative search patterns from text: -(space|　)-"phrase" or -'phrase' or -`phrase`
function parseNegativePatterns(patternStr: string): { positive: string; negative: string[] } {
  const negativePatterns: string[] = []
  let positivePattern = patternStr
  
  // Match patterns: (^ or space or fullwidth space) followed by - followed by quoted phrase
  const negativeRegex = /(^|[\s\u3000])-["'`]([^"'`]+)["'`]/g
  let match: RegExpExecArray | null
  
  while ((match = negativeRegex.exec(patternStr)) !== null) {
    negativePatterns.push(match[2])
  }
  
  // Remove negative patterns from the positive search
  if (negativePatterns.length > 0) {
    positivePattern = patternStr.replace(/(^|[\s\u3000])-["'`]([^"'`]+)["'`]/g, '').trim()
  }
  
  return { positive: positivePattern, negative: negativePatterns }
}

// Levenshtein distance calculation for fuzzy matching
function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length
  const len2 = s2.length

  // Create a 2D array to store distances
  const dp: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0))

  // Initialize base cases
  for (let i = 0; i <= len1; i++) dp[i][0] = i
  for (let j = 0; j <= len2; j++) dp[0][j] = j

  // Fill in the rest of the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return dp[len1][len2]
}

// Calculate allowed distance threshold based on pattern length
function getAllowedDistance(patternLength: number): number {
  if (patternLength <= 3) return 1
  if (patternLength <= 7) return 2
  return 3
}

// Check if value matches pattern using fuzzy matching
function fuzzyMatch(val: string, pattern: string): boolean {
  // First check for exact substring match
  if (val.includes(pattern)) return true

  // Calculate distance and check against threshold
  const distance = levenshteinDistance(val, pattern)
  const allowedDistance = getAllowedDistance(pattern.length)

  if (distance <= allowedDistance) return true

  // Also check if pattern is a fuzzy substring of val
  // Slide a window of pattern length over val and check each
  if (val.length >= pattern.length) {
    for (let i = 0; i <= val.length - pattern.length; i++) {
      const substring = val.substring(i, i + pattern.length)
      const subDist = levenshteinDistance(substring, pattern)
      if (subDist <= allowedDistance) return true
    }
  }

  return false
}

function valueMatches(val: string, pattern: any, mode: string, flagAutoModify: boolean = false, isNameField: boolean = false, normalizedVal?: string, flagAllowWild: boolean = false, isTextField: boolean = false, flagNearly: boolean = false) {
  val = val === undefined || val === null ? '' : String(val)
  if(pattern === null || pattern === undefined) return true
  
  const patternStr = String(pattern)
  
  // Parse negative patterns (for text fields and name field)
  const { positive: positivePattern, negative: negativePatterns } = parseNegativePatterns(patternStr)
  
  // Check negative patterns first - if any match, exclude this card
  if (negativePatterns.length > 0) {
    for (const negPattern of negativePatterns) {
      if (val.includes(negPattern)) {
        return false
      }
    }
  }
  
  // If only negative patterns (no positive pattern), and we passed negative check, return true
  if (!positivePattern || positivePattern === '') {
    return negativePatterns.length > 0
  }
  
  // Apply wildcard matching for name and text fields if flagAllowWild is true and pattern contains *
  if((isNameField || isTextField) && flagAllowWild && positivePattern.includes('*')) {
    // Protect * from normalization by temporarily replacing it
    const placeholder = '\uFFFF' // Use a character unlikely to appear in card names
    const protectedPattern = positivePattern.replace(/\*/g, placeholder)
    
    const targetVal = (isNameField && flagAutoModify)
      ? (normalizedVal !== undefined ? normalizedVal : normalizeForSearch(val))
      : val
    const normalizedPattern = (isNameField && flagAutoModify)
      ? normalizeForSearch(protectedPattern)
      : protectedPattern
    
    // Convert to regex: escape special chars, then replace placeholder with .*
    const regexPattern = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(new RegExp(placeholder, 'g'), '.*') // Convert placeholder to .*
    
    const regex = isTextField ? new RegExp(regexPattern) : new RegExp(`^${regexPattern}$`)
    return regex.test(targetVal)
  }
  
  // Apply normalization for name field if flagAutoModify is true
  if(isNameField && flagAutoModify) {
    // Use pre-computed nameModified if available, otherwise compute on the fly
    const normalized = normalizedVal !== undefined ? normalizedVal : normalizeForSearch(val)
    const normalizedPattern = normalizeForSearch(positivePattern)

    // Apply fuzzy matching if flagNearly is true
    if(flagNearly) {
      return fuzzyMatch(normalized, normalizedPattern)
    }

    if(mode === 'partial') return normalized.indexOf(normalizedPattern) !== -1
    return normalized === normalizedPattern
  }

  // Apply fuzzy matching for name field without normalization
  if(isNameField && flagNearly) {
    return fuzzyMatch(val, positivePattern)
  }
  
  // For text fields, always use substring matching
  if(isTextField) {
    return val.includes(positivePattern)
  }
  
  if(mode === 'partial') return val.indexOf(positivePattern) !== -1
  return val === positivePattern
}

// Parse command line arguments, supporting both --flag format and key=value format
function parseArgs(args: string[]): {
  filterRaw: Record<string, any>
  cols: string[] | null
  mode: string
  includeRuby: boolean
  flagAutoPend: boolean
  flagAutoSupply: boolean
  flagAutoRuby: boolean
  flagAutoModify: boolean
  flagAllowWild: boolean
  flagNearly: boolean
  max: number
  sort: string | undefined
  raw: boolean
} {
  const filterRaw: Record<string, any> = {}
  let cols: string[] | null = null
  let mode = 'exact'
  let includeRuby = true
  let flagAutoPend = true
  let flagAutoSupply = true
  let flagAutoRuby = true
  let flagAutoModify = true
  let flagAllowWild = true
  let flagNearly = false
  let max = 100
  let sort: string | undefined = undefined
  let raw = false

  // Filter field flags
  const filterFlags = ['name', 'text', 'cardId', 'cardType', 'race', 'attribute', 'atk', 'def', 'level', 'levelValue', 'pendulumScale', 'ruby', 'linkValue', 'linkArrows']

  let i = 0
  while (i < args.length) {
    const arg = args[i]

    // Handle --flag value format
    if (arg.startsWith('--')) {
      const flagName = arg.slice(2)

      if (flagName === 'raw') {
        raw = true
        i++
        continue
      }

      // Check if next arg exists and is not a flag
      const nextArg = args[i + 1]
      if (nextArg === undefined || nextArg.startsWith('--')) {
        console.error(`Missing value for --${flagName}`)
        process.exit(2)
      }

      if (filterFlags.includes(flagName)) {
        filterRaw[flagName] = nextArg
        i += 2
        continue
      }

      switch (flagName) {
        case 'cols':
          cols = nextArg.split(',')
          break
        case 'mode':
          mode = nextArg
          break
        case 'max':
          max = parseInt(nextArg, 10)
          if (!Number.isInteger(max) || max < 0) max = 100
          break
        case 'sort':
          sort = nextArg
          break
        case 'includeRuby':
          includeRuby = nextArg !== 'false'
          break
        case 'flagAutoPend':
          flagAutoPend = nextArg !== 'false'
          break
        case 'flagAutoSupply':
          flagAutoSupply = nextArg !== 'false'
          break
        case 'flagAutoRuby':
          flagAutoRuby = nextArg !== 'false'
          break
        case 'flagAutoModify':
          flagAutoModify = nextArg !== 'false'
          break
        case 'flagAllowWild':
          flagAllowWild = nextArg !== 'false'
          break
        case 'flagNearly':
          flagNearly = nextArg === 'true'
          break
        default:
          console.error(`Unknown flag: --${flagName}`)
          process.exit(2)
      }
      i += 2
      continue
    }

    // Handle key=value format (legacy support)
    if (arg.includes('=')) {
      const eqIndex = arg.indexOf('=')
      const key = arg.substring(0, eqIndex)
      const value = arg.substring(eqIndex + 1)

      // Check if it's a filter field
      if (filterFlags.includes(key)) {
        filterRaw[key] = value
        i++
        continue
      }

      switch (key) {
        case 'cols':
          cols = value.split(',')
          break
        case 'mode':
          mode = value
          break
        case 'max':
          max = parseInt(value, 10)
          if (!Number.isInteger(max) || max < 0) max = 100
          break
        case 'sort':
          sort = value
          break
        case 'includeRuby':
          includeRuby = value !== 'false'
          break
        case 'flagAutoPend':
          flagAutoPend = value !== 'false'
          break
        case 'flagAutoSupply':
          flagAutoSupply = value !== 'false'
          break
        case 'flagAutoRuby':
          flagAutoRuby = value !== 'false'
          break
        case 'flagAutoModify':
          flagAutoModify = value !== 'false'
          break
        case 'flagAllowWild':
          flagAllowWild = value !== 'false'
          break
        case 'flagNearly':
          flagNearly = value === 'true'
          break
        default:
          console.error(`Unknown option: ${key}`)
          process.exit(2)
      }
      i++
      continue
    }

    // Try to parse as JSON filter (legacy format)
    try {
      const parsed = JSON.parse(arg)
      Object.assign(filterRaw, parsed)
    } catch {
      console.error(`Invalid argument: ${arg}`)
      process.exit(2)
    }
    i++
  }

  return {
    filterRaw,
    cols,
    mode,
    includeRuby,
    flagAutoPend,
    flagAutoSupply,
    flagAutoRuby,
    flagAutoModify,
    flagAllowWild,
    flagNearly,
    max,
    sort,
    raw
  }
}

async function main(){
  const args = process.argv.slice(2)
  if(args.length===0){ console.error('Expecting filter arguments. Use --help for usage.'); process.exit(2) }

  // Parse arguments
  const {
    filterRaw,
    cols,
    mode,
    includeRuby,
    flagAutoPend,
    flagAutoSupply,
    flagAutoRuby,
    flagAutoModify,
    flagAllowWild,
    flagNearly,
    max,
    sort,
    raw
  } = parseArgs(args)

  if (Object.keys(filterRaw).length === 0) {
    console.error('No filter conditions specified')
    process.exit(2)
  }

  // Normalize filter into per-field structure: { field: {op, cond[]} }
  const filter: Record<string,{op:'and'|'or', cond:any[]}> = {}
  for(const k of Object.keys(filterRaw)){
    const v = filterRaw[k]
    if(v && typeof v === 'object' && (v.op || Array.isArray(v.cond) || v.cond)){
      const op = v.op === 'or' ? 'or' : 'and'
      const cond = Array.isArray(v.cond) ? v.cond : (v.cond !== undefined ? [v.cond] : [])
      filter[k] = {op, cond}
    } else if(Array.isArray(v)){
      filter[k] = {op: 'or', cond: v}
    } else {
      filter[k] = {op: 'and', cond: [v]}
    }
  }

  if(mode !== 'exact' && mode !== 'partial'){
    console.error('mode must be "exact" or "partial"')
    process.exit(2)
  }
  
  // Check for mode and flagAllowWild conflict
  if(mode === 'partial' && flagAllowWild){
    console.error('mode partial and flagAllowWild cannot be used together')
    process.exit(2)
  }

  // Disallow regex literal inputs entirely (no regex support)
  function containsRegexLiteral(v:any): boolean{
    if(v === null || v === undefined) return false
    if(typeof v === 'string') return v.startsWith('/') && v.endsWith('/')
    if(Array.isArray(v)) return v.some(vi=>containsRegexLiteral(vi))
    if(typeof v === 'object'){
      if(v.cond) return containsRegexLiteral(v.cond)
      return Object.values(v).some(vi=>containsRegexLiteral(vi))
    }
    return false
  }
  for(const k of Object.keys(filterRaw)){
    if(containsRegexLiteral(filterRaw[k])){
      console.error('Regex literals (/.../) are not supported')
      process.exit(2)
    }
  }
  // If partial mode requested, ensure only 'name' is being filtered (partial allowed only for name)
  if(mode === 'partial'){
    const otherKeys = Object.keys(filterRaw).filter(k=>k !== 'name')
    if(otherKeys.length>0){ console.error('mode partial is only allowed when filtering by name'); process.exit(2) }
  }

  // Find project root (where package.json is)
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
  const projectRoot = await findProjectRoot(__dirname)
  
  const dataDir = path.join(projectRoot, 'data')
  const cardsFile = path.join(dataDir,'cards-all.tsv')
  const detailFile = path.join(dataDir,'detail-all.tsv')
  if(!fs.existsSync(cardsFile) || !fs.existsSync(detailFile)){ console.error(`data files not found at ${dataDir}`); process.exit(2) }

  const rl = readline.createInterface({ input: fs.createReadStream(cardsFile), crlfDelay: Infinity })
  let headers: string[] = []
  const matchedCards: Array<Record<string,string>> = []
  const neededCardIds = new Set<string>()
  let nameModifiedIndex = -1

  for await (const line of rl){
    if(!line) continue
    if(headers.length===0){ 
      headers = line.split('\t')
      nameModifiedIndex = headers.indexOf('nameModified')
      continue 
    }
    const parts = line.split('\t')
    const obj: any = {}
    for(let i=0;i<headers.length;i++) obj[headers[i]] = parts[i] === undefined ? '' : parts[i]
    let ok = true
    for(const k of Object.keys(filter)){
      const f = filter[k]
      if(!f || f.cond.length===0) continue
      const matches = f.cond.map(cond=>{
        // partial mode only applies to 'name' field
        const useMode = (k === 'name') ? mode : 'exact'
        const fieldValue = obj[k] === undefined ? '' : obj[k]
        const isNameField = (k === 'name')
        const isTextField = ['text', 'pendulumText', 'supplementInfo', 'pendulumSupplementInfo'].includes(k)
        // Use pre-computed nameModified if available
        const normalizedVal = (isNameField && nameModifiedIndex >= 0) ? obj['nameModified'] : undefined
        const matchesField = valueMatches(fieldValue, cond, useMode, flagAutoModify, isNameField, normalizedVal, flagAllowWild, isTextField, flagNearly)

        // If searching by name and includeRuby is true, also check ruby field
        if(k === 'name' && includeRuby && !matchesField){
          const rubyValue = obj['ruby'] === undefined ? '' : obj['ruby']
          return valueMatches(rubyValue, cond, useMode, flagAutoModify, true, undefined, flagAllowWild, false, flagNearly)
        }
        
        return matchesField
      })
      const passed = f.op === 'or' ? matches.some(Boolean) : matches.every(Boolean)
      if(!passed){ ok = false; break }
    }
    if(ok){ matchedCards.push(obj); if(obj.cardId) neededCardIds.add(obj.cardId) }
  }

  const needDetails = matchedCards.length>0 && (!cols || cols.some(c=>!headers.includes(c)) || (flagAutoSupply && (cols.includes('text') || cols.includes('pendulumText'))) || (flagAutoPend && (cols.includes('text') || cols.includes('pendulumText'))))
  const detailsMap: Record<string, any> = {}
  if(needDetails){
    const drl = readline.createInterface({ input: fs.createReadStream(detailFile), crlfDelay: Infinity })
    let dheaders: string[] = []
    for await (const line of drl){
      if(!line) continue
      if(dheaders.length===0){ dheaders = line.split('\t'); continue }
      const parts = line.split('\t')
      const obj: any = {}
      for(let i=0;i<dheaders.length;i++) obj[dheaders[i]] = parts[i] === undefined ? '' : parts[i]
      if(neededCardIds.has(obj.cardId)) detailsMap[obj.cardId] = obj
    }
  }

  // Apply sorting if requested
  if(sort){
    const sortParts = sort.split(':')
    const sortField = sortParts[0]
    const sortOrder = sortParts[1] || 'asc' // default to asc
    
    if(!['asc', 'desc'].includes(sortOrder)){
      console.error('sort order must be "asc" or "desc"')
      process.exit(2)
    }
    
    // Validate sortField exists in headers
    if(!headers.includes(sortField)){
      console.error(`Invalid sort field "${sortField}". Available fields: ${headers.join(', ')}`)
      process.exit(2)
    }
    
    matchedCards.sort((a, b) => {
      const valA = a[sortField] || ''
      const valB = b[sortField] || ''
      
      // Numeric comparison for numeric fields
      const numericFields = ['cardId', 'atk', 'def', 'levelValue', 'pendulumScale']
      if(numericFields.includes(sortField)){
        const numA = parseInt(valA) || 0
        const numB = parseInt(valB) || 0
        return sortOrder === 'asc' ? numA - numB : numB - numA
      }
      
      // String comparison (handles Japanese kana/kanji)
      const result = valA.localeCompare(valB, 'ja')
      return sortOrder === 'asc' ? result : -result
    })
  }
  
  // Apply max limit
  const totalMatches = matchedCards.length
  const limitedCards = matchedCards.slice(0, max)
  const limitReached = totalMatches > max

  const results: any[] = []
  for(const c of limitedCards){
    const merged = {...c, ...(detailsMap[c.cardId] || {})}
    if(cols){
      const resultCols = [...cols]
      
      const hasName = cols.includes('name')
      const hasRuby = cols.includes('ruby')
      const hasText = cols.includes('text')
      const hasPendulumText = cols.includes('pendulumText')
      
      // Auto-include ruby if flagAutoRuby=true and name is requested
      if(flagAutoRuby && hasName && !hasRuby && !cols.includes('ruby')){
        resultCols.push('ruby')
      }
      
      // Auto-include pendulumText if flagAutoPend=true and text is requested and card has pendulum effect
      if(flagAutoPend && hasText && merged.pendulumText && !hasPendulumText && !cols.includes('pendulumText')){
        resultCols.push('pendulumText')
      }
      
      // Auto-include supplement columns if flagAutoPend is true (only if not empty)
      if(flagAutoPend){
        if(hasText && merged.supplementInfo && !cols.includes('supplementInfo')){
          resultCols.push('supplementInfo')
        }
        if((hasPendulumText || (hasText && merged.pendulumText)) && merged.pendulumSupplementInfo && !cols.includes('pendulumSupplementInfo')){
          resultCols.push('pendulumSupplementInfo')
        }
      }
      
      // Auto-include supplement columns if flagAutoSupply is true (always if text/pendulumText requested)
      if(flagAutoSupply){
        if(hasText && !cols.includes('supplementInfo') && !resultCols.includes('supplementInfo')){
          resultCols.push('supplementInfo')
        }
        if((hasPendulumText || (hasText && merged.pendulumText)) && !cols.includes('pendulumSupplementInfo') && !resultCols.includes('pendulumSupplementInfo')){
          resultCols.push('pendulumSupplementInfo')
        }
      }
      
      results.push(Object.fromEntries(resultCols.map(col=>[col, merged[col]])))
    } else {
      results.push(merged)
    }
  }

  // Show warning if limit reached (unless --raw mode)
  if(limitReached && !raw){
    console.error(`Warning: Result limit reached. Showing ${max} of ${totalMatches} matches. Use max=N to adjust limit.`)
  }

  // Output as JSONL (one JSON object per line)
  if (Array.isArray(results) && results.length > 0) {
    results.forEach(item => console.log(JSON.stringify(item)))
  }
  // No output for empty results
}

main().catch(e=>{ console.error(e); process.exit(2) })
