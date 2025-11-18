#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import url from 'url'

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
// flagNearly: false (default) | true - (TODO) when true, uses fuzzy matching for name search to handle typos and minor variations
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

function valueMatches(val: string, pattern: any, mode: string, flagAutoModify: boolean = false, isNameField: boolean = false, normalizedVal?: string, flagAllowWild: boolean = false, isTextField: boolean = false) {
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
    if(mode === 'partial') return normalized.indexOf(normalizedPattern) !== -1
    return normalized === normalizedPattern
  }
  
  // For text fields, always use substring matching
  if(isTextField) {
    return val.includes(positivePattern)
  }
  
  if(mode === 'partial') return val.indexOf(positivePattern) !== -1
  return val === positivePattern
}

async function main(){
  const args = process.argv.slice(2)
  if(args.length===0){ console.error('Expecting JSON filter as first arg'); process.exit(2) }
  // Filter format supports either simple {field: value} or
  // {field: {op: 'and'|'or', cond: [v1,v2,...]}} semantics.
  // Example: {"name": {"op":"or","cond":["ヴァレット","ローダー"]}, "cardId":"22107"}
  let filterRaw: Record<string, any> = {}
  try{ filterRaw = JSON.parse(args[0]) }catch(e){ console.error('Invalid JSON filter'); process.exit(2) }

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
  const colsArg = args.find(a=>a.startsWith('cols='))
  const cols = colsArg ? colsArg.replace(/^cols=/,'').split(',') : null
  const modeArg = args.find(a=>a.startsWith('mode='))
  const mode = modeArg ? modeArg.replace(/^mode=/,'') : 'exact'
  const includeRubyArg = args.find(a=>a.startsWith('includeRuby='))
  const includeRuby = includeRubyArg ? includeRubyArg.replace(/^includeRuby=/,'') !== 'false' : true
  const flagAutoPendArg = args.find(a=>a.startsWith('flagAutoPend='))
  const flagAutoPend = flagAutoPendArg ? flagAutoPendArg.replace(/^flagAutoPend=/,'') !== 'false' : true
  const flagAutoSupplyArg = args.find(a=>a.startsWith('flagAutoSupply='))
  const flagAutoSupply = flagAutoSupplyArg ? flagAutoSupplyArg.replace(/^flagAutoSupply=/,'') !== 'false' : true
  const flagAutoRubyArg = args.find(a=>a.startsWith('flagAutoRuby='))
  const flagAutoRuby = flagAutoRubyArg ? flagAutoRubyArg.replace(/^flagAutoRuby=/,'') !== 'false' : true
  const flagAutoModifyArg = args.find(a=>a.startsWith('flagAutoModify='))
  const flagAutoModify = flagAutoModifyArg ? flagAutoModifyArg.replace(/^flagAutoModify=/,'') !== 'false' : true
  const flagAllowWildArg = args.find(a=>a.startsWith('flagAllowWild='))
  const flagAllowWild = flagAllowWildArg ? flagAllowWildArg.replace(/^flagAllowWild=/,'') !== 'false' : true
  const flagNearlyArg = args.find(a=>a.startsWith('flagNearly='))
  const flagNearly = flagNearlyArg ? flagNearlyArg.replace(/^flagNearly=/,'') === 'true' : false
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
  
  // flagNearly is not yet implemented
  if(flagNearly){
    console.error('flagNearly is not yet implemented')
    process.exit(2)
  }

  const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
  const dataDir = path.join(__dirname,'../data')
  const cardsFile = path.join(dataDir,'cards-all.tsv')
  const detailFile = path.join(dataDir,'detail-all.tsv')
  if(!fs.existsSync(cardsFile) || !fs.existsSync(detailFile)){ console.error('data files not found'); process.exit(2) }

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
        const matchesField = valueMatches(fieldValue, cond, useMode, flagAutoModify, isNameField, normalizedVal, flagAllowWild, isTextField)
        
        // If searching by name and includeRuby is true, also check ruby field
        if(k === 'name' && includeRuby && !matchesField){
          const rubyValue = obj['ruby'] === undefined ? '' : obj['ruby']
          return valueMatches(rubyValue, cond, useMode, flagAutoModify, true, undefined, flagAllowWild, false)
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

  const results: any[] = []
  for(const c of matchedCards){
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

  // Output as JSONL (one JSON object per line)
  if (Array.isArray(results) && results.length > 0) {
    results.forEach(item => console.log(JSON.stringify(item)))
  }
  // No output for empty results
}

main().catch(e=>{ console.error(e); process.exit(2) })
