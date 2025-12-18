# Yu-Gi-Oh! Card Database CLI

Command-line tools for searching Yu-Gi-Oh! card database locally with full Japanese card data.

## Features

### CLI Commands

- **ygo_search** - Search cards with flexible filters
- **ygo_bulk_search** - Efficient bulk search (up to 50 queries)
- **ygo_extract** - Extract card patterns from text
- **ygo_replace** - Extract and replace patterns with card IDs or names
- **ygo_seek** - Get random or range-specific card information
- **ygo_convert** - Convert file formats (JSON, CSV, TSV, JSONL)
- **ygo_faq_search** - Search Official FAQ database

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

## Installation

```bash
# Clone repository
git clone https://github.com/TomoTom0/YuGiOh-Search-CLI.git
cd YuGiOh-Search-CLI

# Install dependencies
bun install

# Build project (required!)
bun run build

# Download data files (37.6MB total)
bash scripts/setup/setup-data.sh

# Optional: Install CLI commands globally
bun link
```

## Usage

### Global CLI Commands

After `bun link`, you can use these commands globally:

```bash
# Search cards by name
ygo_search '{"name":"青眼の白龍"}' cols=name,cardId

# Wildcard search
ygo_search '{"name":"ブルーアイズ*"}' cols=name,atk

# Bulk search
ygo_bulk_search '[{"filter":{"name":"青眼"}}]'

# Extract patterns from text
ygo_extract "Use {ブルーアイズ*} and 《青眼の白龍》"

# Replace patterns with card IDs
ygo_replace "{青眼の白龍}を召喚" --raw
ygo_replace "{青眼の白龍}を召喚" --mount-par --raw

# Get random cards
ygo_seek --max 5
ygo_seek --range 4000-5000 --max 20
ygo_seek --range 4000-4100 --all --format csv

# Search FAQ database
ygo_faq_search cardId=6808 limit=5
ygo_faq_search cardName="青眼*" limit=10
ygo_faq_search question="*シンクロ召喚*"

# Convert file formats
ygo_convert input.json:output.jsonl
```

### Direct Node Execution

```bash
node dist/cli/ygo_search.js '{"name":"青眼"}' cols=name,cardId
node dist/cli/ygo_extract.js "{青眼の白龍}"
node dist/cli/ygo_replace.js "{青眼}を召喚" --raw
node dist/cli/ygo_convert.js input.json:output.csv
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

- [docs/usage/build-and-run.md](docs/usage/build-and-run.md) - Build and development guide
- [docs/usage/shell-commands.md](docs/usage/shell-commands.md) - Detailed CLI command reference
- [docs/usage/usage.md](docs/usage/usage.md) - Usage examples and configuration
- [docs/usage/schema.md](docs/usage/schema.md) - Database schema and column definitions for TSV files
- [CHANGELOG.md](CHANGELOG.md) - Release notes and version history
- [docs/README.md](docs/README.md) - Documentation index

## License

MIT

## Data Source

Card data is collected from official Yu-Gi-Oh! OCG Card Database.
