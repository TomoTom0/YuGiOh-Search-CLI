# FAQ Search Feature Implementation Tasks

## Phase 1: Core Infrastructure
- [x] Create feature branch `feature/faq-search`
- [x] Define FAQ types (types/faq.ts)
  - FAQ record structure
  - Card reference structure (extracted from {{name|id}})
  - Search result with embedded card info
- [x] Create FAQ loader utility (utils/faq-loader.ts)
  - Load faq-all.tsv
  - Parse card references from Q&A text
  - Build cardId → faqIds reverse index
  - Cache in memory
- [x] Extract card info from Q&A text
  - Parse {{name|id}} patterns
  - Lookup full card data from cards-all.tsv
  - Attach card specs to search results

## Phase 2: Search Tools Implementation
- [x] search_faq (unified search function)
  - Get FAQ by faqId
  - Search by cardId (using reverse index)
  - Search by question text (with wildcard support)
  - Search by answer text (with wildcard support)
  - Include extracted card info in all results

## Phase 3: Advanced Features
- [x] search_faq_by_card_spec
  - Search cards by spec (level, type, etc.)
  - Find FAQs containing those cards
  - Cross-reference with cards-all.tsv via card search
- [x] search_faq_by_card_name
  - Search by card name with wildcard support
  - Integrates with existing card search
- [ ] bulk_search_faq
  - Multiple FAQ queries in one call
  - Optimize for batch processing

## Phase 4: Integration
- [x] Add FAQ tools to MCP server (ygo-search-card-server.ts)
- [x] Create CLI commands
  - ygo_faq_search CLI created
- [x] Update README.md with FAQ search documentation

## Phase 5: Testing & Polish
- [x] Test with sample queries
  - Tested faqId search
  - Tested cardId search with reverse index
  - Tested question/answer text search
  - Verified card info embedding
- [ ] Performance benchmarking
- [ ] Add examples to docs/
- [ ] Update USAGE.md

## Completed Features

### Core Implementation ✅
- FAQ types with card reference structure
- FAQ loader with in-memory caching
- Card ID reverse index for O(1) lookup
- Normalization for text search
- Wildcard support with *
- Full card data embedding in results

### CLI & MCP Integration ✅
- `ygo_faq_search` CLI command
- `search_faq` MCP tool
- Support for output file saving
- Consistent with existing tool patterns

### Performance ✅
- In-memory cache (~16MB for FAQ data)
- CardId reverse index for instant lookup
- Pre-normalized text for fast matching
- Lazy card loading (only when needed)

## Example Usage

```bash
# Search by FAQ ID
ygo_faq_search '{"faqId":100}'

# Search by card ID (finds all FAQs mentioning this card)
ygo_faq_search '{"cardId":6808,"limit":5}'

# Search by card name (exact)
ygo_faq_search '{"cardName":"青眼の白龍","limit":5}'

# Search by card name (wildcard)
ygo_faq_search '{"cardName":"青眼*","limit":10}'
ygo_faq_search '{"cardName":"*ドラゴン","limit":10}'

# Search by card specifications
ygo_faq_search '{"cardFilter":{"race":"dragon","levelValue":"8"},"limit":5}'
ygo_faq_search '{"cardFilter":{"cardType":"spell","spellEffectType":"quick"},"limit":5}'
ygo_faq_search '{"cardFilter":{"atk":"3000","def":"2500"},"limit":5}'

# Search in questions
ygo_faq_search '{"question":"シンクロ召喚","limit":10}'

# Search in answers with wildcard
ygo_faq_search '{"answer":"*無効*","limit":20}'
```

### Response Structure
Each FAQ result includes:
- `faqId`, `question`, `answer`, `updatedAt`
- `questionCards[]` - Full card data for all cards in question
- `answerCards[]` - Full card data for all cards in answer
- `allCardIds[]` - Unique card IDs from both Q&A

## Key Design Decision
**Card Info Attachment**: When returning Q&A text, always parse and include:
- Card names found in {{name|id}} patterns
- Full card data (name, type, atk, def, text, etc.)
- This enables rich context for AI understanding

## Performance Strategy
- In-memory cache: ~16MB for FAQ data
- Reverse index: O(1) lookup for cardId search
- Pre-normalized text for fast matching
- Lazy card data loading (only when FAQ is returned)
