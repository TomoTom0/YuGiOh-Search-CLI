/**
 * Worker API handlers - Export all endpoint handlers
 */

export { handleCardSearch } from './card-search.js'
export { handleFAQSearch } from './faq-search.js'
export { handleSemanticCardSearch, handleSemanticFAQSearch } from './semantic-search.js'
export { handleVectorizeCards, handleVectorizeFAQs, handleVectorSetup, handleVectorSetupGeneric } from './vectorize.js'
export { handleExtractCards } from './extract-cards.js'
export { handleReplaceCards } from './replace-cards.js'
export { handleSeekCards } from './seek-cards.js'
export { handleBulkSearch } from './bulk-search.js'
export { handleUpdate } from './update.js'
export { handleDocs } from './docs.js'
export { handleConvert } from './convert.js'
export { handleCardById, handleStats } from './info.js'
