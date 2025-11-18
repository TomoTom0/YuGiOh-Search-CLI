# Shell Commands Guide

## Installation

```bash
cd /home/tomo/work/prac/ts/ygo-db-local-mcp

# 1. Install dependencies
npm install

# 2. Build project (required!)
npm run build

# 3. Install global commands (optional)
npm link
```

This creates global commands:
- `ygo_search` - Search cards
- `ygo_bulk_search` - Bulk search (not yet implemented as CLI)
- `ygo_extract` - Extract and search card patterns from text
- `ygo_convert` - Convert between JSON/JSONL/JSONC/YAML formats

**Note**: After build, scripts work without tsx!

## PATH Setup

If commands are not found, add to your `~/.bashrc` or `~/.zshrc`:

```bash
export PATH="$HOME/.nvm/versions/node/v22.19.0/bin:$PATH"
```

Then reload:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

## Commands

### ygo_search - Search cards

```bash
# Basic search
ygo_search '{"name":"青眼"}'

# With columns
ygo_search '{"name":"青眼"}' cols=name,cardId,text

# Wildcard search
ygo_search '{"text":"*破壊*"}' cols=name,text

# Save to file
ygo_search '{"name":"青眼"}' outputPath=results.jsonl

# Multiple conditions
ygo_search '{"cardType":"罠","trapEffectType":"カウンター罠"}' cols=name,text
```

### ygo_bulk_search - Bulk search

```bash
# Multiple filters
ygo_bulk_search '{"name":"青眼"}' '{"name":"ブラック・マジシャン"}'

# With columns and output
ygo_bulk_search '{"race":"ドラゴン族"}' '{"race":"魔法使い族"}' \
  cols=name,race,atk \
  outputPath=races.jsonl
```

### ygo_extract - Extract card names from text

```bash
# Extract patterns: {flexible}, 《exact》, {{name|id}}
ygo_extract "{青眼の白龍}とブラック・マジシャンを召喚"

# With multiple pattern types
ygo_extract "{ブルーアイズ*}と《青眼の白龍》と{{真紅眼の黒竜|6349}}"

# Output to file
ygo_extract "{青眼}で攻撃" outputPath=extracted.jsonl
```

### ygo_convert - Convert file formats

```bash
# JSON to JSONL
ygo_convert input.json:output.jsonl

# YAML to JSON
ygo_convert data.yaml:output.json

# Multiple conversions
ygo_convert a.json:a.yaml b.jsonl:b.json

# Supported formats: .json, .jsonl, .jsonc, .yaml, .yml
```

## Environment Variables

```bash
# Set default output directory
export YGO_OUTPUT_DIR=/path/to/output

# Now you can omit outputDir
ygo_search '{"name":"青眼"}' outputPath=result.jsonl
# → saves to /path/to/output/result.jsonl
```

## Options

All search commands support:
- `cols=col1,col2,...` - Columns to return
- `mode=exact|partial` - Search mode
- `outputPath=path` - Output file path
- `outputDir=dir` - Output directory

## Help

```bash
ygo_search --help
ygo_bulk_search --help
ygo_extract --help
ygo_convert --help
```

## Uninstall

```bash
npm unlink -g ygo-search-card-mcp
```
