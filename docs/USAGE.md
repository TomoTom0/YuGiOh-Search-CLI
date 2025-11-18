# Yu-Gi-Oh Card Search MCP Server

## Installation

Already installed. Dependencies:
- `@modelcontextprotocol/sdk`
- `tsx` (for running TypeScript)
- `zod` (for parameter validation)

## MCP Client Configuration

### Claude Desktop

**macOS/Linux:**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `~/.config/Claude/claude_desktop_config.json` (Linux):

```json
{
  "mcpServers": {
    "ygo-search-card": {
      "command": "node",
      "args": ["/absolute/path/to/ygo-db-local-mcp/src/ygo-search-card-server.js"]
    }
  }
}
```

**Windows:**

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "ygo-search-card": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\ygo-db-local-mcp\\src\\ygo-search-card-server.js"]
    }
  }
}
```

### Cline (VS Code Extension)

Open Cline MCP settings and add:

```json
{
  "ygo-search-card": {
    "command": "node",
    "args": ["/absolute/path/to/ygo-db-local-mcp/src/ygo-search-card-server.js"]
  }
}
```

### Other MCP Clients

Configure with:
- **Command**: `node`
- **Args**: `["/absolute/path/to/ygo-db-local-mcp/src/ygo-search-card-server.js"]`
- **Transport**: stdio (JSON-RPC 2.0)

**Important:** Use absolute paths. Replace `/absolute/path/to/` with your actual installation directory.

After adding the configuration, restart your MCP client.

## Usage

### As MCP Server

Start the server manually (for testing):
```bash
node src/ygo-search-card-server.js
```

The server communicates via stdio using JSON-RPC 2.0 protocol.

### Direct CLI Usage

```bash
# Exact match with wildcard
npx tsx scripts/mcp/search-cards.ts '{"name":"ブルーアイズ*"}' cols=name,cardId

# Find cards ending with "ドラゴン"
npx tsx scripts/mcp/search-cards.ts '{"name":"*ドラゴン"}' cols=name,atk

# Partial match (substring search, no wildcard)
npx tsx scripts/mcp/search-cards.ts '{"name":"青眼"}' cols=name,cardId mode=partial

# Disable wildcard to search for literal "*"
npx tsx scripts/mcp/search-cards.ts '{"name":"*"}' cols=name flagAllowWild=false
```

## MCP Tools

### search_cards

Single card search tool.

**Parameters:**
- `filter` (object, required): Field-value pairs for filtering
- `cols` (array of strings, optional): Columns to return
- `mode` (string, optional): "exact" (default) or "partial"
- `includeRuby` (boolean, optional, default: true): When true and filtering by name, also searches the ruby (reading) field
- `flagAutoPend` (boolean, optional, default: true): When true and cols includes 'text', automatically includes pendulumText/pendulumSupplementInfo for pendulum monsters
- `flagAutoSupply` (boolean, optional, default: true): When true and cols includes 'text', automatically includes supplementInfo (always, even if empty)
- `flagAutoRuby` (boolean, optional, default: true): When true and cols includes 'name', automatically includes ruby (reading)
- `flagAutoModify` (boolean, optional, default: true): When filtering by name, normalizes input to ignore whitespace, symbols (including ・★☆※‼！？。、:：;；brackets, quotes, and other punctuation), case, half/full width, hiragana/katakana differences, and kanji variants (竜→龍). Uses pre-computed nameModified column for efficient matching.
- `flagAllowWild` (boolean, optional, default: true): When true, treats `*` (asterisk) as a wildcard that matches any characters in name and text fields (text, pendulumText, supplementInfo, pendulumSupplementInfo). Works with flagAutoModify. Cannot be used with mode=partial. Also supports negative search: `(space|　)-"phrase"` or `-'phrase'` or `-\`phrase\`` to exclude cards containing the phrase.
- `flagNearly` (boolean, optional, default: false): (TODO - not yet implemented) When true, uses fuzzy matching for name search to handle typos and minor variations

**Example MCP request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "search_cards",
    "arguments": {
      "filter": {"name": "ブルーアイズ*"},
      "cols": ["name", "atk"],
      "mode": "exact"
    }
  }
}
```

**Wildcard search examples:**
```json
// Find all cards starting with "ブルーアイズ"
{"filter": {"name": "ブルーアイズ*"}, "cols": ["name"]}

// Find all cards ending with "ドラゴン"
{"filter": {"name": "*ドラゴン"}, "cols": ["name"]}

// Find all cards containing "Evil" and "Twin" in that order
{"filter": {"name": "Evil*Twin*"}, "cols": ["name"]}

// Text field wildcard: find cards with "destroy" and "monster"
{"filter": {"text": "*destroy*monster*"}, "cols": ["name", "text"]}

// Disable wildcard to search for literal "*"
{"filter": {"name": "*ドラゴン"}, "cols": ["name"], "flagAllowWild": false}
```

**Negative search examples:**
```json
// Find cards with "destroy" but not "negate"
{"filter": {"text": "destroy -\"negate\""}, "cols": ["name", "text"]}

// Find cards with "special summon" but not "hand" or "deck"
{"filter": {"text": "special summon -\"hand\" -\"deck\""}, "cols": ["name", "text"]}

// Combine wildcard and negative: cards with "dragon" but not "effect"
{"filter": {"text": "*dragon* -\"effect\""}, "cols": ["name", "text"]}

// Only negative: cards without "once per turn"
{"filter": {"text": "-\"once per turn\""}, "cols": ["name", "text"]}

// Use single quotes or backticks
{"filter": {"text": "destroy -'target'"}, "cols": ["name"]}
{"filter": {"text": "summon -`negate`"}, "cols": ["name"]}
```

**Note on negative search:**
- Syntax: `(space|　)-"phrase"` or `-'phrase'` or `-\`phrase\``
- Can appear anywhere in the search pattern
- Works with text, pendulumText, supplementInfo, pendulumSupplementInfo fields
- Also works with name field
- Multiple negative patterns are supported
- Can be combined with wildcards

### bulk_search_cards

**New!** Bulk search multiple cards at once. Much more efficient than calling search_cards multiple times.

**Performance**: ~73% faster than individual calls for 10 queries.

**Parameters:**
- `queries` (array, required): Array of query objects (1-50 queries)
  - Each query has the same structure as `search_cards` parameters

**Example MCP request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "bulk_search_cards",
    "arguments": {
      "queries": [
        {"filter": {"name": "青眼の白龍"}, "cols": ["name", "atk"]},
        {"filter": {"name": "ブラック・マジシャン"}, "cols": ["name", "atk"]},
        {"filter": {"cardId": "4007"}, "cols": ["name", "text"]}
      ]
    }
  }
}
```

**Response format:**
```json
[
  [{"name": "青眼の白龍", "atk": "3000"}],
  [{"name": "ブラック・マジシャン", "atk": "2500"}],
  []
]
```

Each element is an array of results (same as `search_cards`). Empty arrays indicate no matches or errors.

### extract_and_search_cards

**New!** Extract card name patterns from text and search for them automatically.

**Card name patterns:**
- `{card-name}` - Flexible search with wildcards and normalization (e.g., `{ブルーアイズ*}`)
- `《card-name》` - Exact search with normalization but no wildcards (e.g., `《青眼の白龍》`)
- `{{card-name|cardId}}` - Search by card ID (most precise) (e.g., `{{青眼の白龍|4007}}`)

**Parameters:**
- `text` (string, required): Text containing card name patterns

**Example MCP request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "extract_and_search_cards",
    "arguments": {
      "text": "効果：{{青眼の白龍|4007}}を墓地へ送り、{Evil*Twin*}を特殊召喚できる。"
    }
  }
}
```

**Response format:**
```json
{
  "cards": [
    {
      "pattern": "{{青眼の白龍|4007}}",
      "type": "cardId",
      "query": "4007",
      "results": [/* full card data */]
    },
    {
      "pattern": "{Evil*Twin*}",
      "type": "flexible",
      "query": "Evil*Twin*",
      "results": [/* 8 cards matching pattern */]
    }
  ]
}
```

**Direct CLI usage:**
```bash
npx tsx scripts/mcp/extract-and-search-cards.ts "Use {ブルーアイズ*} and 《青眼の白龍》"
```

**Note:**
- All fields are included in results (same as specifying all columns in `search_cards`)
- Patterns are extracted in order: `{{...}}` first, then `《...》`, then `{...}`
- If no patterns are found, returns empty `cards` array

### judge_and_replace_cards

**New!** Extract card patterns, search, and intelligently replace them based on match results.

**Replacement Logic:**
- **1 match** → `{{card-name|cardId}}` (automatically resolved)
- **Multiple matches** → ``{{`original-query`_`name|id`_`name|id`_...}}`` (requires manual selection)
- **No matches** → ``{{NOTFOUND_`original-query`}}`` (marked as not found)
- **Already processed** → `{{name|id}}` patterns are preserved

**Parameters:**
- `text` (string, required): Text containing card name patterns

**Example MCP request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "judge_and_replace_cards",
    "arguments": {
      "text": "Use {ブルーアイズ*} and 《青眼の白龍》 cards"
    }
  }
}
```

**Response format:**
```json
{
  "processedText": "Use {{`ブルーアイズ*`_`青眼の白龍|4007`_`青眼の究極竜|2129`_...}} and {{青眼の白龍|4007}} cards",
  "hasUnprocessed": true,
  "warnings": [
    "⚠️ Text contains unprocessed patterns that require manual review",
    "Found 1 pattern(s) with multiple matches - please select correct one"
  ],
  "processedPatterns": [
    {
      "original": "{ブルーアイズ*}",
      "replaced": "{{`ブルーアイズ*`_`青眼の白龍|4007`_`青眼の究極竜|2129`_...}}",
      "status": "multiple"
    },
    {
      "original": "《青眼の白龍》",
      "replaced": "{{青眼の白龍|4007}}",
      "status": "resolved"
    }
  ]
}
```

**Direct CLI usage:**
```bash
npx tsx src/judge-and-replace.ts "Use {ブルーアイズ*} and 《青眼の白龍》"
```

**Workflow:**
1. Extract patterns from text
2. Search for each pattern
3. Replace based on match count
4. User manually edits ambiguous/not-found patterns
5. Re-run `judge_and_replace_cards` on edited text
6. Repeat until `hasUnprocessed` is false

**Note:**
- Backticks (`` ` ``) are used to distinguish multi-match candidates from card names containing underscores
- Already processed `{{name|id}}` patterns are skipped and preserved
- Warnings are provided when manual intervention is needed

## Additional Notes

**Note:** 
- When `includeRuby` is true, searching for "ブルーアイズ" will match both cards with "ブルーアイズ" in the `name` field and in the `ruby` field (like "青眼の白龍" with ruby "ブルーアイズ・ホワイト・ドラゴン")
- When `flagAutoRuby` is true (default), requesting `cols=["name"]` will automatically include `ruby` in results
- When `flagAutoPend` is true (default), requesting `cols=["text"]` for pendulum monsters will automatically include `pendulumText` and `pendulumSupplementInfo`
- When `flagAutoModify` is true (default), kanji variants are normalized (e.g., "天盃竜" matches "天盃龍"), and name searches ignore whitespace, symbols, case differences, full/half-width, and hiragana/katakana differences. For example, "あしすと　やみー" will match "アシスト★ヤミー！"
- When `flagAllowWild` is true (default), `*` acts as a wildcard in name searches. For example, "ブルーアイズ*" matches all cards starting with "ブルーアイズ". This works with normalized searches (flagAutoModify), so "ぶるーあいず*" also matches.
- By default (flagAutoSupply=true), requesting `text` will automatically include `supplementInfo`, and requesting `pendulumText` will include `pendulumSupplementInfo`
- flagAutoPend only includes supplement fields if they are not empty, while flagAutoSupply always includes them when text/pendulumText is requested
- `mode=partial` and `flagAllowWild=true` cannot be used together

### ygo_replace - Replace Card Patterns

Extract card name patterns and replace with verified card IDs or exact names.

**Basic Usage:**
```bash
ygo_replace "{青眼の白龍}を召喚して攻撃"
# Output: {"processedText":"{{青眼の白龍|4007}}を召喚して攻撃",...}
```

**Options:**
- `--raw`: Output only the processed text (no JSON)
- `--mount-par`: Use 《name》 format instead of {{name|id}}

**Examples:**
```bash
# Normal mode with JSON output
ygo_replace "{青眼の白龍}を召喚"

# Raw text output
ygo_replace "{青眼の白龍}を召喚" --raw
# Output: {{青眼の白龍|4007}}を召喚

# Mount-par mode (exact name format)
ygo_replace "{青眼の白龍}を召喚" --mount-par --raw
# Output: 《青眼の白龍》を召喚

# Multiple cards
ygo_replace "デッキ: {青眼の白龍} x3, {真紅眼の黒竜} x2" --raw
# Output: デッキ: {{青眼の白龍|4007}} x3, {{真紅眼の黒竜|4088}} x2

# With wildcards
ygo_replace "{ブルーアイズ*}を使う" --mount-par --raw
```

### ygo_seek - Random Card Retrieval

Get random or range-specific card information from the database.

**Basic Usage:**
```bash
# Get 10 random cards (default)
ygo_seek

# Get 5 random cards
ygo_seek --max 5
```

**Options:**
- `--max N`: Maximum number of cards (default: 10)
- `--random`: Enable random selection (default: true)
- `--no-random`: Disable random selection (sequential)
- `--range start-end`: Filter by cardId range
- `--all`: Get all cards in range (overrides --max, requires --range)
- `--col a,b,c`: Columns to retrieve (default: cardId,name)
- `--format FORMAT`: Output format - json|csv|tsv|jsonl (default: json)

**Examples:**
```bash
# Random 5 cards with specific columns
ygo_seek --max=5 --col=cardId,name,atk,def

# Cards in range 4000-5000 (random 20)
ygo_seek --range=4000-5000 --max=20

# All cards in range
ygo_seek --range=4000-4100 --all

# CSV format output
ygo_seek --max=10 --format=csv --col=cardId,name,atk,def

# TSV format for range
ygo_seek --range=4000-4050 --all --format=tsv

# JSONL format (one JSON per line)
ygo_seek --max=5 --format=jsonl

# Non-random (sequential) selection
ygo_seek --range=4000-4100 --no-random --max=10
```

**Output Examples:**

JSON (default):
```json
[
  {
    "cardId": "4007",
    "name": "青眼の白龍"
  },
  {
    "cardId": "4088",
    "name": "真紅眼の黒竜"
  }
]
```

CSV:
```csv
"cardId","name","atk"
"4007","青眼の白龍","3000"
"4088","真紅眼の黒竜","2400"
```

TSV:
```
cardIdnameatk
4007青眼の白龍3000
4088真紅眼の黒竜2400
```

JSONL:
```
{"cardId":"4007","name":"青眼の白龍"}
{"cardId":"4088","name":"真紅眼の黒竜"}
```


**Available Columns (26 total):**

From cards-all.tsv (21 columns):
```
cardType, name, nameModified, ruby, cardId, ciid, imgs, text, 
attribute, levelType, levelValue, race, monsterTypes, atk, def, 
linkMarkers, pendulumScale, pendulumText, isExtraDeck, 
spellEffectType, trapEffectType
```

From detail-all.tsv (5 additional columns):
```
cardName, supplementInfo, supplementDate, 
pendulumSupplementInfo, pendulumSupplementDate
```

Note: cardId appears in both files but is not duplicated in output.

**Getting all columns:**
```bash
# All columns in JSON format
ygo_seek --max 5 --col-all

# All columns in CSV format (good for spreadsheet import)
ygo_seek --range 4000-4100 --all --col-all --format csv > cards.csv

# All columns in TSV format
ygo_seek --max 100 --col-all --format tsv > cards.tsv
```
