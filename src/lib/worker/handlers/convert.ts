/**
 * Format converter handler for worker API endpoint
 */

import type { Env } from '../../../worker.js'
import { errorResponse } from '../response.js'

/**
 * Parse format string (supports json and jsonl)
 * @param content - Input content
 * @param format - Format type ('json' or 'jsonl')
 * @returns Parsed data
 */
function parseFormatString(content: string, format: 'json' | 'jsonl'): any {
  if (format === 'json') {
    return JSON.parse(content)
  } else if (format === 'jsonl') {
    return content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
  }
  throw new Error(`Unsupported format: ${format}`)
}

/**
 * Format data to string (supports json and jsonl)
 * @param data - Data to format
 * @param format - Format type ('json' or 'jsonl')
 * @returns Formatted string
 */
function formatOutput(data: any, format: 'json' | 'jsonl'): string {
  if (format === 'json') {
    return JSON.stringify(data, null, 2)
  } else if (format === 'jsonl') {
    const items = Array.isArray(data) ? data : [data]
    return items.map(item => JSON.stringify(item)).join('\n')
  }
  throw new Error(`Unsupported format: ${format}`)
}

/**
 * Handle convert API endpoint
 * @param request - The incoming request
 * @param env - The environment variables
 * @returns Response with converted data
 */
export async function handleConvert(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as {
      input?: string
      inputFormat?: 'json' | 'jsonl'
      outputFormat?: 'json' | 'jsonl'
    }

    if (!body || !body.input) {
      return errorResponse('Missing input parameter', 400, 'MISSING_INPUT')
    }

    if (!body.outputFormat) {
      return errorResponse('Missing outputFormat parameter', 400, 'MISSING_OUTPUT_FORMAT')
    }

    // Auto-detect input format if not provided
    let inputFormat: 'json' | 'jsonl' = body.inputFormat || 'json'
    if (!body.inputFormat) {
      // Try to detect format by checking if it's JSONL
      if (body.input.includes('\n') && !body.input.trim().startsWith('[')) {
        inputFormat = 'jsonl'
      }
    }

    // Validate formats
    const validFormats = ['json', 'jsonl']
    if (!validFormats.includes(inputFormat)) {
      return errorResponse(`Invalid inputFormat "${inputFormat}". Valid formats: json, jsonl`, 400, 'INVALID_INPUT_FORMAT')
    }
    if (!validFormats.includes(body.outputFormat)) {
      return errorResponse(`Invalid outputFormat "${body.outputFormat}". Valid formats: json, jsonl`, 400, 'INVALID_OUTPUT_FORMAT')
    }

    // Parse and convert
    const data = parseFormatString(body.input, inputFormat)
    const converted = formatOutput(data, body.outputFormat)

    return Response.json({
      converted,
      inputFormat,
      outputFormat: body.outputFormat
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : 'Unknown error'
    console.error('Convert error:', e)
    return errorResponse('Conversion failed', 500, 'CONVERSION_ERROR', [errorMessage])
  }
}
