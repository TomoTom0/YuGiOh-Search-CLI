# Shell Commands Guide

## Installation

```bash
cd /path/to/YuGiOh-Search-CLI

# 1. Install dependencies
pnpm install

# 2. Build project (required!)
pnpm run build

# 3. Download data files
bash scripts/setup/setup-data.sh

# 4. Install global commands (optional)
pnpm link --global
```

This creates the global command:
- `ygo-search` - Search cards (subcommands: `card`, `faq`, `extract`, `replace`, `seek`, `bulk`, `convert`, `vector`, `docs`, `update`)

**Note**: After build, scripts work with `node` (no tsx required)!

## PATH Setup

If commands are not found after `pnpm link --global`, ensure your pnpm global bin directory is in PATH:

```bash
# Set up and check pnpm global bin path
pnpm setup
pnpm bin --global

# Add to ~/.bashrc or ~/.zshrc
export PATH="$PATH:$(pnpm bin --global)"
```

Then reload:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

## Commands

### ygo-search - Search cards

```bash
# Basic search
ygo-search '{"name":"青眼"}'

# With columns
ygo-search '{"name":"青眼"}' cols=name,cardId,text

# Wildcard search
ygo-search '{"text":"*破壊*"}' cols=name,text

# Save to file
ygo-search '{"name":"青眼"}' outputPath=results.jsonl

# Multiple conditions
ygo-search '{"cardType":"罠","trapEffectType":"カウンター罠"}' cols=name,text
```

### ygo-search bulk - Bulk search

```bash
# Multiple filters
ygo-search bulk '{"name":"青眼"}' '{"name":"ブラック・マジシャン"}'

# With columns and output
ygo-search bulk '{"race":"ドラゴン族"}' '{"race":"魔法使い族"}' \
  cols=name,race,atk \
  outputPath=races.jsonl
```

### ygo-search extract - Extract card names from text

```bash
# Extract patterns: {flexible}, 《exact》, {{name|id}}
ygo-search extract "{青眼の白龍}とブラック・マジシャンを召喚"

# With multiple pattern types
ygo-search extract "{ブルーアイズ*}と《青眼の白龍》と{{真紅眼の黒竜|6349}}"
```

### ygo-search replace - Replace card patterns with card IDs or names

```bash
# Replace with card ID: {{name|id}}
ygo-search replace "{青眼の白龍}を召喚" --raw

# Replace with card name: 《name》
ygo-search replace "{青眼の白龍}を召喚" --mount-par --raw

# Replace multiple patterns
ygo-search replace "1ターンに{青眼の白龍}と{ブラック・マジシャン}を召喚"
```

### ygo-search seek - Get random or range-specific cards

```bash
# Random cards
ygo-search seek --max 5

# Range selection
ygo-search seek --range 4000-5000 --max 20

# All cards in range
ygo-search seek --range 4000-4100 --all

# Different output formats
ygo-search seek --max 10 --format csv
ygo-search seek --max 10 --format jsonl --col cardId,name,atk,def
ygo-search seek --max 10 --col-all  # All columns
```

### ygo-search faq - Search FAQ database

```bash
# Search by FAQ ID
ygo-search faq faqId=100

# Search by card ID
ygo-search faq cardId=6808 limit=5

# Search by card name
ygo-search faq cardName="青眼*" limit=10

# Search by card specifications
ygo-search faq cardFilter.race=dragon cardFilter.levelValue=8

# Search by question/answer text
ygo-search faq question="*シンクロ召喚*"
ygo-search faq answer="*無効*" limit=20

# Output options
ygo-search faq cardId=6808 --fcol faqId,question
ygo-search faq cardId=6808 --col name,atk,def
ygo-search faq cardName="青眼*" --format csv
```

### ygo-search convert - Convert file formats

```bash
# JSON to JSONL
ygo-search convert input.json:output.jsonl

# JSON to CSV
ygo-search convert input.json:output.csv

# JSONL to TSV
ygo-search convert input.jsonl:output.tsv

# Multiple conversions
ygo-search convert a.json:a.csv b.jsonl:b.tsv

# Supported formats: .json, .jsonl, .csv, .tsv, .yaml
```

## Environment Variables

```bash
# Set default output directory
export YGO_OUTPUT_DIR=/path/to/output

# Now you can omit outputDir
ygo-search '{"name":"青眼"}' outputPath=result.jsonl
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
ygo-search --help
ygo-search card --help
ygo-search faq --help
ygo-search extract --help
ygo-search replace --help
ygo-search seek --help
ygo-search bulk --help
ygo-search convert --help
ygo-search docs --help
ygo-search vector --help
```

## Uninstall

```bash
pnpm unlink --global ygo-search
```
