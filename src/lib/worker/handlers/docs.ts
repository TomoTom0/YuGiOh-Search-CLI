/**
 * API documentation handler for worker API endpoint
 */

import type { Env } from '../../../worker.js'
import { errorResponse, jsonResponse } from '../response.js'

/**
 * Handle API documentation endpoint
 * @param request - The incoming request
 * @param url - The request URL
 * @param env - The environment variables
 * @returns Response with API documentation
 */
export async function handleDocs(request: Request, url: URL, env: Env): Promise<Response> {
  const name = url.searchParams.get('name')
  const list = url.searchParams.get('list')

  const docs = {
    version: '1.0.0',
    endpoints: [
      {
        path: '/health',
        method: 'GET',
        description: 'Health check endpoint',
        response: {
          status: 'healthy',
          timestamp: '2026-01-29T00:00:00.000Z'
        }
      },
      {
        path: '/api/stats',
        method: 'GET',
        description: 'Get database statistics',
        response: {
          cards: 12000,
          faqs: 5000,
          timestamp: '2026-01-29T00:00:00.000Z'
        }
      },
      {
        path: '/api/cards/search',
        method: 'GET',
        description: 'Search cards with advanced filters',
        parameters: [
          { name: 'filter[field]', type: 'string', description: 'Filter by field (name, attribute, race, etc.)' },
          { name: 'filter[field][or][]', type: 'string', description: 'OR condition for field' },
          { name: 'filter[field][and][]', type: 'string', description: 'AND condition for field' },
          { name: 'mode', type: 'exact|partial', default: 'exact', description: 'Search mode' },
          { name: 'limit', type: 'number', default: 10, description: 'Maximum number of results (1-100)' },
          { name: 'offset', type: 'number', default: 0, description: 'Result offset (0-1000)' },
          { name: 'auto_modify', type: 'boolean', default: true, description: 'Enable text normalization' },
          { name: 'allow_wild', type: 'boolean', default: true, description: 'Allow wildcard (*) in queries' },
          { name: 'include_ruby', type: 'boolean', default: true, description: 'Include ruby (furigana) search' }
        ],
        examples: [
          '/api/cards/search?filter[name]=青眼*&mode=partial',
          '/api/cards/search?filter[attribute]=光&filter[race]=ドラゴン族',
          '/api/cards/search?filter[atk]=3000&filter[def]=2500'
        ]
      },
      {
        path: '/api/cards/by-id',
        method: 'GET',
        description: 'Get card by ID',
        parameters: [
          { name: 'id', type: 'string', required: true, description: 'Card ID' }
        ],
        examples: ['/api/cards/by-id?id=89631139']
      },
      {
        path: '/api/cards/extract',
        method: 'POST',
        description: 'Extract card patterns from text and search',
        request: {
          text: 'I use {ブルーアイズ*} and 《青眼の白龍》'
        },
        response: {
          matches: [
            {
              pattern: '{ブルーアイズ*}',
              type: 'flexible',
              query: 'ブルーアイズ*',
              results: []
            }
          ],
          total: 1
        }
      },
      {
        path: '/api/cards/replace',
        method: 'POST',
        description: 'Replace card patterns with normalized format',
        request: {
          text: 'I use {ブルーアイズ*}',
          mountPar: false
        },
        response: {
          processedText: 'I use {{青眼の白龍|89631139}}',
          hasUnprocessed: false,
          warnings: [],
          processedPatterns: []
        }
      },
      {
        path: '/api/cards/seek',
        method: 'GET',
        description: 'Get random or range-specified cards',
        parameters: [
          { name: 'max', type: 'number', default: 10, description: 'Maximum number of results (1-100)' },
          { name: 'random', type: 'boolean', default: true, description: 'Random selection' },
          { name: 'range_start', type: 'string', description: 'Start of card ID range' },
          { name: 'range_end', type: 'string', description: 'End of card ID range' },
          { name: 'all', type: 'boolean', default: false, description: 'Get all cards in range (requires range_start/end)' },
          { name: 'cols', type: 'string', description: 'Comma-separated column names' }
        ],
        examples: [
          '/api/cards/seek?max=20&random=true',
          '/api/cards/seek?range_start=4000&range_end=5000&max=30'
        ]
      },
      {
        path: '/api/cards/bulk',
        method: 'POST',
        description: 'Bulk search multiple queries (max 50)',
        request: {
          queries: [
            { filter: { name: '青眼*' }, mode: 'partial' },
            { filter: { cardId: '89631139' } }
          ]
        },
        response: {
          results: [
            { query: 0, data: [], total: 0 },
            { query: 1, data: [], total: 1 }
          ]
        }
      },
      {
        path: '/api/faqs/search',
        method: 'GET',
        description: 'Search FAQs',
        parameters: [
          { name: 'q', type: 'string', required: true, description: 'Search query' },
          { name: 'limit', type: 'number', default: 10, description: 'Maximum number of results' },
          { name: 'offset', type: 'number', default: 0, description: 'Result offset' }
        ]
      },
      {
        path: '/api/cards/semantic-search',
        method: 'GET',
        description: 'Semantic search for cards (requires Vectorize)',
        parameters: [
          { name: 'q', type: 'string', required: true, description: 'Search query' },
          { name: 'limit', type: 'number', default: 10, description: 'Maximum number of results' }
        ]
      },
      {
        path: '/api/faqs/semantic-search',
        method: 'GET',
        description: 'Semantic search for FAQs (requires Vectorize)',
        parameters: [
          { name: 'q', type: 'string', required: true, description: 'Search query' },
          { name: 'limit', type: 'number', default: 10, description: 'Maximum number of results' }
        ]
      }
    ]
  }

  // Handle list parameter
  if (list !== null) {
    const endpointList = docs.endpoints.map(ep => ({
      path: ep.path,
      method: ep.method,
      description: ep.description
    }))

    return Response.json({
      version: docs.version,
      endpoints: endpointList,
      total: endpointList.length
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  // Handle name parameter
  if (name) {
    const endpoint = docs.endpoints.find(ep =>
      ep.path.includes(name) ||
      ep.path.toLowerCase().includes(name.toLowerCase())
    )

    if (!endpoint) {
      return errorResponse(`Endpoint "${name}" not found`, 404, 'NOT_FOUND', [
        `Available endpoints: ${docs.endpoints.map(ep => ep.path).join(', ')}`
      ])
    }

    return Response.json(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  // Return all documentation
  return jsonResponse(docs)
}
