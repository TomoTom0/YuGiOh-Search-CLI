# CLI Usage Guide

## Installation

```bash
# Clone and setup
git clone https://github.com/TomoTom0/ygo-db-local-mcp.git
cd ygo-db-local-mcp

# Install dependencies
bun install

# Build project (required!)
bun run build

# Download data files
bash scripts/setup/setup-data.sh

# Install CLI commands globally (optional)
bun link
```

## CLI Commands

All commands can be used globally after `bun link`, or directly with `node dist/cli/`.

### ygo_search - Search Cards

```bash
# Basic search by name
ygo_search '{"name":"青眼の白龍"}' cols=name,cardId

# Wildcard search (matches any characters)
ygo_search '{"name":"ブルーアイズ*"}' cols=name,atk
ygo_search '{"name":"*ドラゴン"}' cols=name,atk

# Partial match (substring, no wildcard)
ygo_search '{"name":"青眼"}' cols=name,cardId mode=partial

# Search multiple conditions
ygo_search '{"cardType":"モンスター","race":"ドラゴン族"}' cols=name,atk,def

# Search by card ID
ygo_search '{"cardId":"6808"}' cols=name,text

# Search text (case-insensitive)
ygo_search '{"text":"*破壊*"}' cols=name,text

# Negative search (exclude)
ygo_search '{"text":"*破壊*","name":"-\"フィールド\""}' cols=name,text

# With output columns
ygo_search '{"name":"青眼"}' cols=name,cardId,atk,def,text

# Available columns: name, cardId, cardType, race, level, atk, def, text, detail, effect, etc.
```

### ygo_bulk_search - Bulk Search (Multiple Cards)

```bash
# Search multiple cards at once
ygo_bulk_search '[{"filter":{"name":"青眼"}},{"filter":{"name":"ブラック・マジシャン"}}]'

# With columns
ygo_bulk_search '[{"filter":{"race":"ドラゴン族"}},{"filter":{"race":"魔法使い族"}}]' cols=name,race,atk

# Up to 50 queries
ygo_bulk_search '[{"filter":{"name":"青眼"}},{"filter":{"name":"ホワイト・ホルス"}}, ...]'
```

### ygo_extract - Extract Card Patterns from Text

Extract card name patterns for later processing.

```bash
# Extract patterns from text
ygo_extract "{青眼の白龍}とブラック・マジシャンを召喚"

# Supported patterns:
# - {flexible}       - Flexible search with wildcards and normalization
# - 《exact》        - Exact search with normalization
# - {{name|id}}      - Search by card ID

# Multiple pattern types
ygo_extract "{ブルーアイズ*}と《青眼の白龍》と{{真紅眼の黒竜|6349}}"
```

### ygo_replace - Replace Card Patterns with IDs or Names

```bash
# Replace patterns with card IDs: {{name|cardId}}
ygo_replace "{青眼の白龍}を召喚" --raw

# Replace patterns with card names: 《cardName》
ygo_replace "{青眼の白龍}を召喚" --mount-par --raw

# Replace multiple patterns in one text
ygo_replace "1ターンに{青眼の白龍}と{ブラック・マジシャン}を召喚"

# Options:
# --raw          - Output raw replacement without JSON wrapping
# --mount-par    - Use 《name》 format instead of {{name|cardId}}
```

### ygo_seek - Get Random or Range-Specific Cards

```bash
# Get random cards
ygo_seek --max 5

# Get random cards with specific columns
ygo_seek --max 10 --col cardId,name,atk,def

# Range selection (CardId range)
ygo_seek --range 4000-5000 --max 20

# All cards in range
ygo_seek --range 4000-4100 --all

# Different output formats
ygo_seek --max 10 --format json    # Default
ygo_seek --max 10 --format jsonl   # One per line
ygo_seek --max 10 --format csv
ygo_seek --max 10 --format tsv

# Get all columns
ygo_seek --max 10 --col-all

# Options:
# --max N           - Get N random cards
# --range START-END - CardId range (inclusive)
# --all             - Get all cards in range
# --format FORMAT   - Output format (json, jsonl, csv, tsv)
# --col COLS        - Comma-separated columns to include
# --col-all         - Include all available columns
```

### ygo_faq_search - Search Official FAQ Database

```bash
# Search by FAQ ID
ygo_faq_search faqId=100

# Search by card ID
ygo_faq_search cardId=6808 limit=5

# Search by card name (with wildcard)
ygo_faq_search cardName="青眼*" limit=10

# Search by card specifications
ygo_faq_search cardFilter.race=dragon cardFilter.levelValue=8

# Search by question text (with wildcard)
ygo_faq_search question="*シンクロ召喚*"

# Search by answer text
ygo_faq_search answer="*無効*" limit=20

# Output options
ygo_faq_search cardId=6808 --fcol faqId,question  # FAQ columns only
ygo_faq_search cardId=6808 --col name,atk,def    # Card columns only
ygo_faq_search cardName="青眼*" --format csv

# Key=value style (CLI-friendly)
ygo_faq_search cardId=6808 limit=5
ygo_faq_search question="*効果*" answer="*無効*" limit=10

# Options:
# limit N          - Limit number of results (default: all)
# --fcol COLS      - FAQ columns to output
# --col COLS       - Card columns to output
# --format FORMAT  - Output format (json, csv, tsv)
# --random         - Random selection from results
```

### ygo_convert - Convert File Formats

```bash
# Convert JSON to JSONL
ygo_convert input.json:output.jsonl

# Convert JSON to CSV
ygo_convert input.json:output.csv

# Convert JSONL to TSV
ygo_convert input.jsonl:output.tsv

# Multiple conversions
ygo_convert a.json:a.csv b.jsonl:b.tsv c.csv:c.json

# Supported formats: .json, .jsonl, .csv, .tsv
```

## Advanced Usage

### Search Pattern Normalization

All searches automatically normalize:
- Whitespace and symbols (・★☆ etc.)
- Full-width/half-width characters
- Uppercase/lowercase
- Hiragana/katakana
- Kanji variants (竜→龍)

### Wildcard Syntax

- `*` matches any characters: `{ブルーアイズ*}`, `{*ドラゴン}`
- `-"phrase"` excludes cards containing phrase: `{text: "summon -\"negate\"" }`

### Output Examples

```bash
# Pretty JSON output
ygo_search '{"name":"青眼"}' | jq .

# Filter results
ygo_search '{"cardType":"モンスター"}' cols=name,cardId | jq '.[] | select(.atk > 2500)'

# Save to file
ygo_search '{"name":"青眼"}' > results.json

# Pipe to other commands
ygo_search '{"race":"ドラゴン族"}' cols=name,cardId | wc -l
```

## Environment Variables

```bash
# Set default output format
export YGO_FORMAT=jsonl

# Now all commands default to JSONL format
ygo_search '{"name":"青眼"}'
```

## Help

```bash
ygo_search --help
ygo_bulk_search --help
ygo_extract --help
ygo_replace --help
ygo_seek --help
ygo_faq_search --help
ygo_convert --help
```

## MCP Server (Deprecated)

For historical reference, the MCP server can still be used:

```bash
# Start MCP server (CLI recommended instead)
node dist/ygo-search-card-server.js

# Or via npm
bun start
```

However, the CLI commands are the recommended way to use this project.
