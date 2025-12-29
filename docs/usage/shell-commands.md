# Shell Commands Guide

## Installation

```bash
cd /path/to/YuGiOh-Search-CLI

# 1. Install dependencies
bun install

# 2. Build project (required!)
bun run build

# 3. Download data files
bash scripts/setup/setup-data.sh

# 4. Install global commands (optional)
bun link
```

This creates global commands:
- `ygo_search` - Search cards
- `ygo_bulk_search` - Bulk search
- `ygo_extract` - Extract and search card patterns from text
- `ygo_replace` - Replace card patterns with card IDs or names
- `ygo_seek` - Get random or range-specific cards
- `ygo_faq_search` - Search FAQ database
- `ygo_search convert` - Convert between JSON/JSONL/CSV/TSV formats

**Note**: After build, scripts work with `node` (no tsx required)!

## PATH Setup

If commands are not found after `bun link`, ensure your bun global bin directory is in PATH:

```bash
# Check bun global bin path
bun env | grep BUN_INSTALL
# Usually: ~/.bun

# Add to ~/.bashrc or ~/.zshrc
export PATH="$PATH:~/.bun/bin"
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
```

### ygo_replace - Replace card patterns with card IDs or names

```bash
# Replace with card ID: {{name|id}}
ygo_replace "{青眼の白龍}を召喚" --raw

# Replace with card name: 《name》
ygo_replace "{青眼の白龍}を召喚" --mount-par --raw

# Replace multiple patterns
ygo_replace "1ターンに{青眼の白龍}と{ブラック・マジシャン}を召喚"
```

### ygo_seek - Get random or range-specific cards

```bash
# Random cards
ygo_seek --max 5

# Range selection
ygo_seek --range 4000-5000 --max 20

# All cards in range
ygo_seek --range 4000-4100 --all

# Different output formats
ygo_seek --max 10 --format csv
ygo_seek --max 10 --format jsonl --col cardId,name,atk,def
ygo_seek --max 10 --col-all  # All columns
```

### ygo_faq_search - Search FAQ database

```bash
# Search by FAQ ID
ygo_faq_search faqId=100

# Search by card ID
ygo_faq_search cardId=6808 limit=5

# Search by card name
ygo_faq_search cardName="青眼*" limit=10

# Search by card specifications
ygo_faq_search cardFilter.race=dragon cardFilter.levelValue=8

# Search by question/answer text
ygo_faq_search question="*シンクロ召喚*"
ygo_faq_search answer="*無効*" limit=20

# Output options
ygo_faq_search cardId=6808 --fcol faqId,question
ygo_faq_search cardId=6808 --col name,atk,def
ygo_faq_search cardName="青眼*" --format csv
```

### ygo_search convert - Convert file formats

```bash
# JSON to JSONL
ygo_search convert input.json:output.jsonl

# JSON to CSV
ygo_search convert input.json:output.csv

# JSONL to TSV
ygo_search convert input.jsonl:output.tsv

# Multiple conversions
ygo_search convert a.json:a.csv b.jsonl:b.tsv

# Supported formats: .json, .jsonl, .csv, .tsv, .yaml
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
ygo_search card --help
ygo_search faq --help
ygo_search extract --help
ygo_search replace --help
ygo_search seek --help
ygo_search bulk --help
ygo_search convert --help
ygo_search docs --help
ygo_search vector --help
```

## Uninstall

```bash
bun unlink ygo-search-card-mcp
```
