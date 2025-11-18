# Yu-Gi-Oh! Card Database MCP Server

Model Context Protocol (MCP) server for searching Yu-Gi-Oh! card database locally with full Japanese card data.

## Features

### 🔍 Four Search Tools

1. **search_cards** - Single card search with flexible filters
2. **bulk_search_cards** - Efficient bulk search (up to 50 queries)
3. **extract_and_search_cards** - Extract card patterns from text and search automatically
4. **judge_and_replace_cards** - Extract, search, and intelligently replace patterns with card IDs

### 🎲 Random Card Retrieval

- **ygo_seek** - Get random or range-specific card information
  - Random selection with configurable count
  - CardId range filtering
  - Multiple output formats (JSON, CSV, TSV, JSONL)
  - Flexible column selection

### 📝 Card Name Patterns

- `{card-name}` - Flexible search with wildcards (*) and normalization
- `《card-name》` - Exact search with normalization
- `{{card-name|cardId}}` - Search by card ID

### ⚙️ Smart Normalization

Automatically handles:
- Whitespace and symbols (・★☆etc.)
- Full-width/half-width characters
- Uppercase/lowercase
- Hiragana/katakana conversion
- Kanji variants (竜→龍)

### 🔎 Advanced Search Features

- **Wildcard**: Use `*` in name and text fields (e.g., `{text: "*destroy*monster*"}`)
- **Negative search**: Exclude cards with `-"phrase"` (e.g., `{text: "summon -\"negate\""}`)
- **Bulk search**: Search up to 50 cards at once
- **Pattern extraction**: Auto-detect `{flexible}`, `《exact》`, `{{name|id}}` patterns

## Installation

```bash
# Clone repository
git clone https://github.com/TomoTom0/ygo-db-local-mcp.git
cd ygo-db-local-mcp

# Install dependencies
npm install

# Build project (required!)
npm run build

# Download data files (21.2MB total)
# Usage: bash scripts/setup/setup-data.sh [version]
# Default version: v1.0.0
bash scripts/setup/setup-data.sh

# Or specify a version:
# bash scripts/setup/setup-data.sh v1.0.0

# Optional: Install CLI commands globally
npm link
```

### CLI Commands

After `npm link`, you can use these commands:

```bash
# Search cards
ygo_search '{"name":"青眼の白龍"}' cols=name,cardId

# Bulk search
ygo_bulk_search '[{"filter":{"name":"青眼"}}]'

# Extract patterns from text
ygo_extract "Use {ブルーアイズ*} and 《青眼の白龍》"

# Replace patterns with card IDs
ygo_replace "{青眼の白龍}を召喚" --raw
ygo_replace "{青眼の白龍}を召喚" --mount-par --raw  # Output: 《青眼の白龍》を召喚

# Get random cards
ygo_seek --max 5
ygo_seek --range 4000-5000 --max 20
ygo_seek --range 4000-4100 --all --format csv

# Get all columns
ygo_seek --max 10 --col-all

# Convert file formats
ygo_convert input.json:output.jsonl
```

## Usage

### As MCP Server

```bash
# Start MCP server
npm start
```

#### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "ygo-search-card": {
      "command": "node",
      "args": [
        "<YOUR_ABSOLUTE_PATH>/ygo-db-local-mcp/dist/ygo-search-card-server.js"
      ]
    }
  }
}
```

**Note**: 
- Replace `<YOUR_ABSOLUTE_PATH>` with the actual absolute path to your project directory
- Make sure you've run `npm run build` before starting the MCP server
- **No tsx required!** - All scripts run directly with Node.js after build

### Direct CLI

After `npm link`, use the global commands:

```bash
# Search by name
ygo_search '{"name":"青眼の白龍"}' cols=name,cardId

# Wildcard search
ygo_search '{"name":"ブルーアイズ*"}' cols=name,atk

# Extract from text
ygo_extract "Use {ブルーアイズ*} and 《青眼の白龍》"

# Replace patterns (normal: {{name|id}})
ygo_replace "{青眼の白龍}を召喚" --raw

# Replace patterns (mount-par: 《name》)
ygo_replace "{青眼の白龍}を召喚" --mount-par --raw

# Get random cards
ygo_seek --max 10
ygo_seek --range 4000-5000 --max 20 --col cardId,name,atk,def

# Get all cards in range
ygo_seek --range 4000-4100 --all --format csv

# Get all columns
ygo_seek --max 10 --col-all --format jsonl

# Convert file formats
ygo_convert input.json:output.jsonl
```

Or use node directly:

```bash
node dist/search-cards.js '{"name":"青眼の白龍"}' cols=name,cardId
node dist/extract-and-search-cards.js "Use {ブルーアイズ*}"
node dist/judge-and-replace.js "Summon {青眼} and attack"
node dist/format-converter.js input.json:output.jsonl
```

## Database

- **Total cards**: 13,754
- **Format**: TSV (Tab-Separated Values)
- **Language**: Japanese
- **Includes**: Monster, Spell, Trap cards with full text, stats, and supplementary information

## Documentation

- [README.md](docs/README.md) - Technical specification
- [USAGE.md](docs/USAGE.md) - Detailed usage guide

## License

MIT

## Data Source

Card data is collected from official Yu-Gi-Oh! OCG Card Database.
