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
          { name: 'filter[field]', type: 'string', description: 'Filter by field (name, attribute, race, card_type, atk, def, level, level_value, text, ruby, card_id, link_value, pendulum_scale, monster_types, etc.) — use snake_case field names' },
          { name: 'filter[field][or][]', type: 'string', description: 'OR condition for field' },
          { name: 'filter[field][and][]', type: 'string', description: 'AND condition for field' },
          { name: 'mode', type: 'exact|partial', default: 'exact', description: 'Search mode' },
          { name: 'limit', type: 'number', default: 10, description: 'Maximum number of results (1-100)' },
          { name: 'offset', type: 'number', default: 0, description: 'Result offset (0-1000)' },
          { name: 'sort', type: 'string', description: 'Sort field with optional order (e.g. atk:desc, name:asc). Fields: cardId, name, ruby, atk, def, levelValue, etc.' },
          { name: 'auto_modify', type: 'boolean', default: true, description: 'Enable text normalization' },
          { name: 'allow_wild', type: 'boolean', default: true, description: 'Allow wildcard (*) in queries' },
          { name: 'include_ruby', type: 'boolean', default: true, description: 'Include ruby (furigana) search' }
        ],
        examples: [
          '/api/cards/search?filter[name]=青眼*&mode=partial',
          '/api/cards/search?filter[attribute]=光&filter[race]=ドラゴン族',
          '/api/cards/search?filter[atk]=3000&filter[def]=2500',
          '/api/cards/search?filter[cardType]=monster&sort=atk:desc&limit=20',
          '/api/cards/search?filter[name]=青眼*&mode=partial&sort=levelValue:asc'
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
        parameters: [
          { name: 'text', type: 'string', required: true, description: 'Text containing card name patterns (max 10000 characters)' }
        ],
        patternTypes: [
          { pattern: '{card-name}', description: 'Flexible search (wildcard * supported)' },
          { pattern: '《card-name》', description: 'Exact match search' },
          { pattern: '{{name|cardId}}', description: 'Search by card ID' }
        ],
        examples: [
          { request: { text: '{青眼の白龍}と{ブラック・マジシャン}を召喚' }, description: 'Multiple patterns' },
          { request: { text: '{ブルーアイズ*}を召喚' }, description: 'Wildcard search' },
          { request: { text: '《青眼の白龍》で攻撃' }, description: 'Exact match' }
        ],
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
        parameters: [
          { name: 'text', type: 'string', required: true, description: 'Text containing card name patterns' },
          { name: 'mountPar', type: 'boolean', default: false, description: 'Use 《card-name》 format instead of {{name|cardId}}' }
        ],
        patternTypes: [
          { pattern: '{card-name}', description: 'Flexible search (wildcard * supported)' },
          { pattern: '《card-name》', description: 'Exact match search' },
          { pattern: '{{name|cardId}}', description: 'Search by card ID (verifies/corrects name)' }
        ],
        examples: [
          { request: { text: '{青眼の白龍}を召喚して攻撃' }, description: 'Flexible search' },
          { request: { text: '{青眼*}を召喚' }, description: 'Wildcard search (may return multiple candidates)' },
          { request: { text: '《青眼の白龍》を召喚', mountPar: true }, description: 'Exact match with mountPar' },
          { request: { text: '{{青眼ノ白龍|89631139}}を召喚' }, description: 'cardId pattern (corrects name if wrong)' }
        ],
        response: {
          processedText: '{{青眼の白龍|89631139}}を召喚して攻撃',
          hasUnprocessed: false,
          warnings: [],
          processedPatterns: [{ original: '{青眼の白龍}', replaced: '{{青眼の白龍|89631139}}', status: 'resolved' }]
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
        parameters: [
          { name: 'queries', type: 'array', required: true, description: 'Array of query objects (max 50)' }
        ],
        queryObject: [
          { name: 'filter', type: 'object', required: true, description: 'Filter criteria using snake_case field names (same as /api/cards/search)' },
          { name: 'mode', type: 'exact|partial', default: 'exact', description: 'Search mode' },
          { name: 'limit', type: 'number', default: 10, description: 'Maximum number of results (1-100)' },
          { name: 'offset', type: 'number', default: 0, description: 'Result offset (0-1000)' },
          { name: 'auto_modify', type: 'boolean', default: true, description: 'Enable text normalization' },
          { name: 'allow_wild', type: 'boolean', default: true, description: 'Allow wildcard (*) in queries' },
          { name: 'include_ruby', type: 'boolean', default: true, description: 'Include ruby (furigana) search' }
        ],
        examples: [
          {
            request: {
              queries: [
                { filter: { name: '青眼*' }, mode: 'partial' },
                { filter: { cardId: '89631139' } },
                { filter: { attribute: '光', race: 'ドラゴン族' }, limit: 5 }
              ]
            }
          }
        ],
        response: {
          results: [
            { query: 0, data: [], total: 0 },
            { query: 1, data: [], total: 1 }
          ]
        }
      },
      {
        path: '/api/faqs/search',
        method: 'GET, POST',
        description: 'Search FAQs with multiple query strategies',
        parameters: [
          { name: 'q', type: 'string', description: 'Search in both question and answer (legacy)' },
          { name: 'faqId', type: 'integer', description: 'Exact FAQ ID lookup' },
          { name: 'cardId', type: 'string', description: 'Find FAQs referencing a card ID' },
          { name: 'cardName', type: 'string', description: 'Find FAQs referencing a card by name' },
          { name: 'cardFilter', type: 'object', description: 'Card filter criteria (POST only)' },
          { name: 'question', type: 'string', description: 'Search in question text only' },
          { name: 'answer', type: 'string', description: 'Search in answer text only' },
          { name: 'limit', type: 'number', default: 10, description: 'Maximum number of results (1-100)' },
          { name: 'offset', type: 'number', default: 0, description: 'Result offset (0-1000)' },
          { name: 'allowWild', type: 'boolean', default: true, description: 'Enable wildcard (*) in queries' }
        ],
        examples: [
          '/api/faqs/search?q=青眼',
          '/api/faqs/search?faqId=1',
          '/api/faqs/search?cardId=89631139',
          '/api/faqs/search?cardName=青眼の白龍',
          '/api/faqs/search?question=召喚&answer=墓地'
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
