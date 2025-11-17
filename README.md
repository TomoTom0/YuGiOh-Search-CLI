# Yu-Gi-Oh! Card Database MCP Server

Model Context Protocol (MCP) server for searching Yu-Gi-Oh! card database locally with full Japanese card data.

## Features

### 🔍 Four Search Tools

1. **search_cards** - Single card search with flexible filters
2. **bulk_search_cards** - Efficient bulk search (up to 50 queries)
3. **extract_and_search_cards** - Extract card patterns from text and search automatically
4. **judge_and_replace_cards** - Extract, search, and intelligently replace patterns with card IDs

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

# Download data files (21.2MB total)
# Usage: bash scripts/setup/setup-data.sh [version]
# Default version: v1.0.0
bash scripts/setup/setup-data.sh

# Or specify a version:
# bash scripts/setup/setup-data.sh v1.0.0
```

## Usage

### As MCP Server

```bash
npx tsx src/ygo-search-card-server.ts
# or
npm start
```

#### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "ygo-search-card": {
      "command": "npx",
      "args": [
        "tsx",
        "<YOUR_ABSOLUTE_PATH>/ygo-db-local-mcp/src/ygo-search-card-server.ts"
      ]
    }
  }
}
```

**Note**: Replace `<YOUR_ABSOLUTE_PATH>` with the actual absolute path to your project directory.

### Direct CLI

```bash
# Search by name
npx tsx src/search-cards.ts '{"name":"青眼の白龍"}' cols=name,cardId

# Wildcard search
npx tsx src/search-cards.ts '{"name":"ブルーアイズ*"}' cols=name,atk

# Extract from text
npx tsx src/extract-and-search-cards.ts "Use {ブルーアイズ*} and 《青眼の白龍》"

# Judge and replace patterns
npx tsx src/judge-and-replace.ts "Use {ブルーアイズ*} and 《青眼の白龍》"
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
