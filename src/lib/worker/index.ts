/**
 * Worker library module - Export all worker utilities and handlers
 */

// Environment types
export type { Env } from '../../worker.js'

// Authentication
export { checkAuth, checkScope, SCOPES } from './auth.js'

// Response utilities
export { errorResponse, jsonResponse } from './response.js'

// Logging
export { logRequest, logError } from './logging.js'

// Validation
export { MAX_LIMIT, MAX_OFFSET, MAX_BULK_QUERIES, validateSearchParams, validateSortParam } from './validation.js'

// Database helpers
export { getCardById, getStats } from './database.js'

// Filter parsing and building
export { parseFilterParams, buildWhereClause } from './filters.js'
export type { NormalizedFilter } from './filters.js'

// Pattern extraction and search
export { extractCardPatterns, extractCardPatternsWithIndex, searchCardPattern } from './patterns.js'
export type { ExtractedPattern, ExtractedPatternWithIndex } from './patterns.js'

// Embeddings
export { generateEmbeddings, embedTextWithAzure } from './embeddings.js'

// Handlers
export {
  handleCardSearch,
  handleFAQSearch,
  handleSemanticCardSearch,
  handleSemanticFAQSearch,
  handleVectorizeCards,
  handleVectorizeFAQs,
  handleVectorSetup,
  handleVectorSetupGeneric,
  handleExtractCards,
  handleReplaceCards,
  handleSeekCards,
  handleBulkSearch,
  handleUpdate,
  handleDocs,
  handleConvert,
  handleCardById,
  handleStats
} from './handlers/index.js'
