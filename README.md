# Yu-Gi-Oh! Card Database CLI

Command-line tools for searching Yu-Gi-Oh! card database locally with full Japanese card data.

## Features

### CLI Commands

- **ygo_search card** - Search cards with flexible filters
- **ygo_search faq** - Search Official FAQ database
- **ygo_search extract** - Extract card patterns from text
- **ygo_search replace** - Extract and replace patterns with card IDs or names
- **ygo_search seek** - Get random or range-specific card information
- **ygo_search bulk** - Efficient bulk search (up to 50 queries)
- **ygo_search convert** - Convert file formats (JSON, CSV, TSV, JSONL)
- **ygo_search vector** - Vector search (semantic search) for cards, FAQs, and rules
- **ygo_search docs** - View API documentation for library usage
- **ygo_search update** - Download/update card database (required for first use)

### Card Search Features

#### Card Name Patterns

- `{card-name}` - Flexible search with wildcards (*) and normalization
- `《card-name》` - Exact search with normalization
- `{{card-name|cardId}}` - Search by card ID

#### Smart Normalization

Automatically handles:
- Whitespace and symbols (・★☆ etc.)
- Full-width/half-width characters
- Uppercase/lowercase
- Hiragana/katakana conversion
- Kanji variants (竜→龍)

#### Advanced Search Features

- **Wildcard**: Use `*` in name and text fields (e.g., `{text: "*destroy*monster*"}`)
- **Negative search**: Exclude cards with `-"phrase"` (e.g., `{text: "summon -\"negate\""}`)
- **Bulk search**: Search up to 50 cards at once
- **Pattern extraction**: Auto-detect `{flexible}`, `《exact》`, `{{name|id}}` patterns

### FAQ Search

- Search Official FAQ database (12,578 entries)
- Filter by FAQ ID, card ID, card name patterns
- Search by card specifications (race, level, type, etc.)
- Search question/answer text with wildcards

### Vector Search (Semantic Search)

- **Semantic search**: Find cards, FAQs, and rules by meaning, not just keywords
- **Multi-table search**: Search across cards, FAQs, and custom tables simultaneously
- **Custom data import**: Import any YAML/JSON/JSONL/TSV/CSV data with id/title/text fields
- **Hierarchy support**: Automatically extracts and includes hierarchical paths from YAML/JSON
- **Multilingual embeddings**: Uses multilingual-e5-small model for accurate semantic matching

## Installation

```bash
# Clone repository
git clone https://github.com/TomoTom0/YuGiOh-Search-CLI.git
cd YuGiOh-Search-CLI

# Install dependencies
bun install

# Build project (required!)
bun run build

# Optional: Install CLI commands globally
bun link

# Download card data (37.6MB total) - required for first use
ygo_update_search

# Alternative: Download data manually
bash scripts/setup/setup-data.sh
```

## Usage

### Global CLI Commands

After `bun link`, you can use these commands globally:

```bash
# Search cards by name
ygo_search card --name "青眼の白龍" --cols name,cardId

# Wildcard search
ygo_search card --name "ブルーアイズ*" --cols name,atk

# Search FAQ database
ygo_search faq cardId=6808 limit=5
ygo_search faq cardName="青眼*" limit=10
ygo_search faq question="*シンクロ召喚*"

# Extract patterns from text
ygo_search extract "Use {ブルーアイズ*} and 《青眼の白龍》"

# Replace patterns with card IDs
ygo_search replace "{青眼の白龍}を召喚" --raw
ygo_search replace "{青眼の白龍}を召喚" --mount-par --raw

# Get random cards
ygo_search seek --max 5
ygo_search seek --range 4000-5000 --max 20
ygo_search seek --range 4000-4100 --all --format csv

# Bulk search
ygo_search bulk '[{"filter":{"name":"青眼"}}]'

# Vector search (semantic search)
ygo_search vector setup all                         # Setup vector DB
ygo_search vector search "墓地から特殊召喚"          # Search all tables
ygo_search vector search "チェーン" --type rules --limit 5

# Update/download card database
ygo_search update

# Convert file formats
ygo_search convert input.json:output.jsonl

# View API documentation
ygo_search docs list                 # List all available documentation
ygo_search docs searchCards          # Show searchCards function documentation
ygo_search docs Card                 # Show Card interface documentation
```

### Direct Node Execution

```bash
node dist/cli/ygo_search.js card --name "青眼" --cols name,cardId
node dist/cli/ygo_search.js extract "{青眼の白龍}"
node dist/cli/ygo_search.js replace "{青眼}を召喚" --raw
node dist/cli/ygo_search.js convert input.json:output.csv
node dist/cli/ygo_search.js docs list
```

### Library Usage (TypeScript/JavaScript)

```typescript
import {
  // Card search
  searchCards,

  // FAQ search
  searchFAQ,

  // Pattern extraction and replacement
  extractCardPatterns,
  extractAndSearchCards,
  judgeAndReplace,

  // Card retrieval
  seekCards,

  // Format conversion
  convertFormatFile,
  formatOutput,
  parseFormatString,

  // Vector search
  vectorSearchCards,
  vectorSearchFaqs,
  vectorSearchAll,
  searchTable,
  listTables,

  // Vector DB setup
  convertCardsToJsonl,
  convertFaqsToJsonl,
  convertGenericToJsonl,
  indexFromJsonl
} from 'ygo-search'

// Card search
const cards = await searchCards({
  filter: { name: '青眼の白龍' },
  cols: ['name', 'cardId', 'text']
})

// FAQ search
const faqs = await searchFAQ({
  cardName: '青眼の白龍',
  limit: 10
})

// Pattern extraction
const patterns = extractCardPatterns('{ブルーアイズ*}と《青眼の白龍》')

// Pattern search
const results = await extractAndSearchCards('{ブルーアイズ*}を召喚')

// Pattern replacement
const replaced = await judgeAndReplace('{青眼の白龍}を召喚', {
  replaceFormat: 'id-in-brace'
})

// Random card retrieval
const randomCards = await seekCards({ max: 10 })

// Vector search (semantic search)
const vectorResults = await vectorSearchAll('墓地から特殊召喚', { limit: 5 })

// Custom table search
const rulesResults = await searchTable('rules', 'チェーンブロック', { limit: 5 })

// Format conversion
await convertFormatFile('input.json', 'output.csv')
const yamlString = formatOutput({ key: 'value' }, 'yaml')
```

## Database

### Data Files

- **cards-all.tsv** (8.6MB): Card basic information with 13,754 cards
- **detail-all.tsv** (13MB): Detailed card information (stats, effects, etc.)
- **faq-all.tsv** (16MB): Official FAQ database with 12,578 entries

### Card Information

- Total cards: 13,754
- Total FAQs: 12,578
- Format: TSV (Tab-Separated Values)
- Language: Japanese
- Includes: Monster, Spell, Trap cards with full text, stats, and supplementary information

## Documentation

### User Documentation

- [ビルドと開発ガイド](docs/usage/build-and-run.md) - Build and development guide
- [CLIコマンドリファレンス](docs/usage/shell-commands.md) - Detailed CLI command reference
- [使用例と設定](docs/usage/usage.md) - Usage examples and configuration
- [データベーススキーマ](docs/usage/schema.md) - Database schema and column definitions for TSV files
- [CHANGELOG](CHANGELOG.md) - Release notes and version history
- [ドキュメント目次](docs/README.md) - Documentation index

### API Reference (for Library Users)

**Auto-generated API documentation** is available in Markdown format.

View documentation using the CLI:
```bash
ygo_search docs list              # List all available documentation
ygo_search docs searchCards       # Show function documentation
ygo_search docs Card              # Show interface documentation
```

Or browse directly:
- [API Reference](docs/api/README.md) - Complete API reference (auto-generated by TypeDoc)

Generate the latest documentation:
```bash
bun run docs              # Generate Markdown documentation
```

The generated documentation includes:
- All exported functions with parameters and return types
- TypeScript interfaces and type definitions
- Usage examples with JSDoc comments
- Links to source code

## License

MIT

## Data Source

Card data is collected from official Yu-Gi-Oh! OCG Card Database.
