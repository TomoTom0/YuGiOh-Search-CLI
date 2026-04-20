/**
 * Replace card patterns handler for worker API endpoint
 */

import type { Env } from '../../../worker.js'
import { errorResponse } from '../response.js'
import { extractCardPatternsWithIndex, searchCardPattern, type ExtractedPatternWithIndex } from '../patterns.js'

interface ProcessedPattern {
  original: string
  replaced: string
  status: 'resolved' | 'multiple' | 'notfound' | 'already_processed' | 'corrected'
}

/**
 * Handle replace cards API endpoint
 * @param request - The incoming request
 * @param env - The environment variables
 * @returns Response with processed text and status
 */
export async function handleReplaceCards(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { text?: string; mountPar?: boolean }

    if (!body || !body.text) {
      return errorResponse('Missing text parameter', 400)
    }

    const text = body.text
    const mountPar = body.mountPar || false

    if (text.length > 10000) {
      return errorResponse('Text too long (max 10000 characters)', 400)
    }

    // Extract patterns with index
    const patterns = extractCardPatternsWithIndex(text)

    if (patterns.length === 0) {
      return Response.json({
        processedText: text,
        hasUnprocessed: false,
        warnings: [],
        processedPatterns: []
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Deduplicate patterns before search for efficiency
    const uniquePatternMap = new Map<string, typeof patterns[0]>()
    for (const pattern of patterns) {
      const key = `${pattern.type}::${pattern.query}`
      if (!uniquePatternMap.has(key)) {
        uniquePatternMap.set(key, pattern)
      }
    }
    const uniquePatterns = Array.from(uniquePatternMap.values())

    // Search unique patterns only
    const searchPromises = uniquePatterns.map(pattern => searchCardPattern(pattern, env))
    const uniqueSearchResults = await Promise.all(searchPromises)

    // Create lookup map for search results
    const resultMap = new Map<string, any[]>()
    for (let i = 0; i < uniquePatterns.length; i++) {
      const pattern = uniquePatterns[i]
      const key = `${pattern.type}::${pattern.query}`
      resultMap.set(key, uniqueSearchResults[i])
    }

    // Map search results back to original patterns
    const searchResults = patterns.map(pattern => {
      const key = `${pattern.type}::${pattern.query}`
      return resultMap.get(key) || []
    })

    // Process replacements in reverse order to maintain indices
    const sortedPatterns = patterns
      .map((pattern, index) => ({ pattern, results: searchResults[index] }))
      .sort((a, b) => b.pattern.startIndex - a.pattern.startIndex)

    let processedText = text
    const processedPatterns: ProcessedPattern[] = []
    const warnings: string[] = []
    let hasUnprocessed = false

    // Track processed patterns to avoid duplicates (same as ts-cli)
    const processedPatternKeys = new Set<string>()

    for (const { pattern, results } of sortedPatterns) {
      const resultCount = results.length

      if (pattern.type === 'cardId') {
        // cardId pattern: verify card name
        if (resultCount === 1) {
          const card = results[0]
          const actualName = card.name
          const providedName = pattern.originalName || ''

          if (actualName !== providedName) {
            // Correct card name
            const replacement = mountPar ? `《${actualName}》` : `{{${actualName}|${card.cardId}}}`
            processedText = processedText.substring(0, pattern.startIndex) +
                          replacement +
                          processedText.substring(pattern.startIndex + pattern.pattern.length)

            const key = `${pattern.pattern}::${replacement}`
            if (!processedPatternKeys.has(key)) {
              processedPatternKeys.add(key)
              processedPatterns.push({
                original: pattern.pattern,
                replaced: replacement,
                status: 'corrected'
              })
            }

            warnings.push(`Card name corrected: "${providedName}" → "${actualName}" (cardId: ${card.cardId})`)
          } else {
            // Already correct
            const key = `${pattern.pattern}::${pattern.pattern}`
            if (!processedPatternKeys.has(key)) {
              processedPatternKeys.add(key)
              processedPatterns.push({
                original: pattern.pattern,
                replaced: pattern.pattern,
                status: 'already_processed'
              })
            }
          }
        } else if (resultCount === 0) {
          warnings.push(`cardId "${pattern.query}" not found`)
        } else {
          warnings.push(`cardId "${pattern.query}" found multiple cards. Please check data.`)
        }
      } else if (resultCount === 1) {
        // Exactly one result - replace
        const card = results[0]
        const replacement = mountPar ? `《${card.name}》` : `{{${card.name}|${card.cardId}}}`
        processedText = processedText.substring(0, pattern.startIndex) +
                      replacement +
                      processedText.substring(pattern.startIndex + pattern.pattern.length)

        const key = `${pattern.pattern}::${replacement}`
        if (!processedPatternKeys.has(key)) {
          processedPatternKeys.add(key)
          processedPatterns.push({
            original: pattern.pattern,
            replaced: replacement,
            status: 'resolved'
          })
        }
      } else if (resultCount > 1) {
        // Multiple results
        const candidatesStr = results
          .map((card: any) => `\`${card.name}|${card.cardId}\``)
          .join('_')
        const replacement = `{{\`${pattern.query}\`_${candidatesStr}}}`
        processedText = processedText.substring(0, pattern.startIndex) +
                      replacement +
                      processedText.substring(pattern.startIndex + pattern.pattern.length)

        const key = `${pattern.pattern}::${replacement}`
        if (!processedPatternKeys.has(key)) {
          processedPatternKeys.add(key)
          processedPatterns.push({
            original: pattern.pattern,
            replaced: replacement,
            status: 'multiple'
          })
        }
        hasUnprocessed = true
      } else {
        // No results
        const replacement = `{{NOTFOUND_\`${pattern.query}\`}}`
        processedText = processedText.substring(0, pattern.startIndex) +
                      replacement +
                      processedText.substring(pattern.startIndex + pattern.pattern.length)

        const key = `${pattern.pattern}::${replacement}`
        if (!processedPatternKeys.has(key)) {
          processedPatternKeys.add(key)
          processedPatterns.push({
            original: pattern.pattern,
            replaced: replacement,
            status: 'notfound'
          })
        }
        hasUnprocessed = true
      }
    }

    if (hasUnprocessed) {
      warnings.push('Text contains unprocessed patterns that require manual review')

      // Add detailed warnings
      const notfoundCount = processedPatterns.filter(p => p.status === 'notfound').length
      const multipleCount = processedPatterns.filter(p => p.status === 'multiple').length

      if (notfoundCount > 0) {
        warnings.push(`Found ${notfoundCount} pattern(s) with no matches (NOTFOUND_*)`)
      }
      if (multipleCount > 0) {
        warnings.push(`Found ${multipleCount} pattern(s) with multiple matches - please select correct one`)
      }
    }

    return Response.json({
      processedText,
      hasUnprocessed,
      warnings,
      processedPatterns
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (e) {
    console.error('Replace cards error:', e)
    return errorResponse('Internal server error', 500)
  }
}
