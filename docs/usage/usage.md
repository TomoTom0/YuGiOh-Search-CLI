# CLI Usage Guide

## Installation

```bash
# Clone and setup
git clone https://github.com/TomoTom0/YuGiOh-Search-CLI.git
cd YuGiOh-Search-CLI

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

### ygo_search convert - Convert File Formats

```bash
# Convert JSON to JSONL
ygo_search convert input.json:output.jsonl

# Convert JSON to CSV
ygo_search convert input.json:output.csv

# Convert JSONL to TSV
ygo_search convert input.jsonl:output.tsv

# Multiple conversions
ygo_search convert a.json:a.csv b.jsonl:b.tsv c.csv:c.json

# Supported formats: .json, .jsonl, .csv, .tsv, .yaml
```

### ygo_search vector - Vector Search (Semantic Search)

Vector検索機能は、意味的な類似性に基づいてカード、FAQ、ルールを検索します。

#### セットアップ

```bash
# カード・FAQのVector DBインデックス構築
ygo_search vector setup cards    # カードのみ
ygo_search vector setup faqs     # FAQのみ
ygo_search vector setup all      # 全て

# ルールデータのインポート（YAML形式）
ygo_search vector setup-generic rules.yml --table rules --include-columns name,notes,examples

# 複数ファイルのインポート（glob展開・併記対応）
ygo_search vector setup-generic aa/*.yml bb/data.yml --table rules

# 汎用データのインポート（yaml/json/jsonl/tsv/csv対応）
ygo_search vector setup-generic data.json --table custom-table
```

#### 検索

```bash
# 全テーブルを検索（cards, faqs, rules全て）
ygo_search vector search "墓地から特殊召喚"

# 特定テーブルのみ検索
ygo_search vector search "チェーンブロック" --type cards
ygo_search vector search "効果の発動タイミング" --type faqs
ygo_search vector search "ターンの流れ" --type rules

# 結果数の制限
ygo_search vector search "融合召喚" --limit 5

# スコア閾値による絞り込み
ygo_search vector search "シンクロ召喚" --threshold 0.7

# 出力フォーマット指定
ygo_search vector search "ドラゴン" --format json
ygo_search vector search "ドラゴン" --format jsonl
ygo_search vector search "ドラゴン" --format csv
ygo_search vector search "ドラゴン" --format tsv

# 距離メトリック指定
ygo_search vector search "墓地" --distance cosine  # デフォルト
ygo_search vector search "墓地" --distance l2
ygo_search vector search "墓地" --distance dot
```

#### 汎用データインポートの詳細

```bash
# 必須フィールド: id, title, text
# その他のフィールドは自動的に検索テキストに含まれる

# 特定カラムのみ含める
ygo_search vector setup-generic data.yml --table mytable --include-columns name,notes,examples

# 特定カラムを除外
ygo_search vector setup-generic data.json --table mytable --exclude-columns cite,sourceFile

# 一時JSONLファイルを保持（デバッグ用）
ygo_search vector setup-generic data.yml --table mytable --keep-tmp

# 複数ファイル指定（シェルのglob展開を利用）
ygo_search vector setup-generic rules/*.yml --table rules

# 対応フォーマット:
# - YAML (.yml, .yaml) - 階層構造から自動抽出
# - JSON (.json)       - 階層構造から自動抽出
# - JSONL (.jsonl)     - 1行1レコード
# - TSV (.tsv)         - タブ区切り（ヘッダー必須）
# - CSV (.csv)         - カンマ区切り（ヘッダー必須）
#                        注: 値にカンマが含まれる場合は正しく処理されません。
#                        複雑なCSVの場合はTSVまたはJSON形式を推奨します。
```

#### Vector検索の特徴

- **意味的検索**: キーワードの完全一致ではなく、意味の類似性で検索
- **多言語対応**: multilingual-e5-smallモデルを使用
- **階層構造対応**: YAML/JSONの階層パスが自動的に検索テキストに含まれる
- **並列検索**: 複数テーブルを並列に高速検索
- **カスタムテーブル**: 任意のデータをインポート可能

#### 検索結果の例

```json
{
  "cards": [
    {
      "id": "card-6808",
      "text": "【カード名】 青眼の白龍\n...",
      "metadata": { "cardId": 6808, "cardType": "monster" },
      "score": 0.15
    }
  ],
  "faqs": [
    {
      "id": "faq-123",
      "text": "# 質問\n...\n# 回答\n...",
      "metadata": { "faqId": 123 },
      "score": 0.18
    }
  ],
  "rules": [
    {
      "id": "EC07",
      "text": "【効果の解決】\n【階層】\nEffectsAndChains > Resolution\n...",
      "metadata": { "id": "EC07" },
      "score": 0.12
    }
  ]
}
```

## Library Usage (TypeScript/JavaScript)

ygo-searchはライブラリとしてプログラムから利用することもできます。

### インストール

```bash
npm install ygo-search
# または
bun add ygo-search
```

### 基本的な使用例

#### カード検索

```typescript
import { searchCards, type CardSearchParams } from 'ygo-search'

// 基本検索
const cards = await searchCards({
  filter: { name: '青眼の白龍' },
  cols: ['name', 'cardId', 'text']
})

// ワイルドカード検索
const dragons = await searchCards({
  filter: { name: 'ブルーアイズ*', race: 'ドラゴン族' },
  cols: ['name', 'atk', 'def']
})

// 部分一致検索
const partial = await searchCards({
  filter: { text: '破壊' },
  mode: 'partial',
  cols: ['name', 'text']
})
```

#### FAQ検索

```typescript
import { searchFAQ, type SearchFAQParams } from 'ygo-search'

// カードIDでFAQ検索
const faqs = await searchFAQ({
  cardId: 6808,
  limit: 10
})

// カード名でFAQ検索
const faqsByName = await searchFAQ({
  cardName: '青眼*',
  limit: 20
})

// 質問文で検索
const faqsByQuestion = await searchFAQ({
  question: '*シンクロ召喚*',
  limit: 10
})
```

#### パターン抽出と置換

```typescript
import {
  extractCardPatterns,
  extractAndSearchCards,
  judgeAndReplace
} from 'ygo-search'

// パターン抽出
const patterns = extractCardPatterns('{ブルーアイズ*}と《青眼の白龍》')
// [
//   { pattern: '{ブルーアイズ*}', type: 'flexible', query: 'ブルーアイズ*' },
//   { pattern: '《青眼の白龍》', type: 'exact', query: '青眼の白龍' }
// ]

// パターン抽出と検索
const results = await extractAndSearchCards('{ブルーアイズ*}を召喚')

// パターン判定と置換
const replaced = await judgeAndReplace('{青眼の白龍}を召喚', {
  replaceFormat: 'id-in-brace'  // {{カード名|カードID}}形式
})

const replacedName = await judgeAndReplace('{青眼の白龍}を召喚', {
  replaceFormat: 'name-in-mount-par'  // 《カード名》形式
})
```

#### ランダム/範囲指定カード取得

```typescript
import { seekCards, type SeekCardsOptions } from 'ygo-search'

// ランダムに10件取得
const randomCards = await seekCards({ max: 10 })

// 範囲指定で取得
const rangeCards = await seekCards({
  range: [4000, 5000],
  max: 20,
  cols: ['name', 'cardId', 'atk', 'def']
})

// ランダム順でなく順番通りに取得
const orderedCards = await seekCards({
  range: [4000, 4100],
  noRandom: true,
  max: 50
})
```

#### フォーマット変換

```typescript
import {
  convertFormatFile,
  formatOutput,
  parseFormatString,
  detectFormat
} from 'ygo-search'

// ファイル変換
await convertFormatFile('input.json', 'output.csv')
await convertFormatFile('input.jsonl', 'output.yaml')

// データ変換
const yamlString = formatOutput({ key: 'value', data: [1, 2, 3] }, 'yaml')
const csvString = formatOutput([{ name: 'card1' }, { name: 'card2' }], 'csv')

// パース
const data = parseFormatString('{"key":"value"}', 'json')
const yamlData = parseFormatString('key: value\ndata:\n  - 1\n  - 2', 'yaml')

// フォーマット自動検出
const format = detectFormat('data.jsonl')  // 'jsonl'
```

### Vector検索（意味的検索）

#### Vector DBセットアップ

```typescript
import {
  convertCardsToJsonl,
  convertFaqsToJsonl,
  convertGenericToJsonl,
  indexFromJsonl
} from 'ygo-search'

// カードデータをVector DB用に変換
const cardCount = await convertCardsToJsonl(
  'data/cards-all.tsv',
  'data/detail-all.tsv',
  'tmp/cards.jsonl'
)

// FAQデータをVector DB用に変換
const faqCount = await convertFaqsToJsonl(
  'data/faq-all.tsv',
  'tmp/faqs.jsonl'
)

// 汎用データをVector DB用に変換
const genericCount = await convertGenericToJsonl(
  'rules.yml',
  'tmp/rules.jsonl',
  {
    includeColumns: ['name', 'notes', 'examples']  // 特定カラムのみ含める
    // または
    // excludeColumns: ['cite', 'sourceFile']  // 特定カラムを除外
  }
)

// Vector DBインデックス構築
await indexFromJsonl('cards', 'tmp/cards.jsonl')
await indexFromJsonl('faqs', 'tmp/faqs.jsonl')
await indexFromJsonl('rules', 'tmp/rules.jsonl')
```

#### Vector検索

```typescript
import {
  vectorSearchCards,
  vectorSearchFaqs,
  vectorSearchAll,
  searchTable,
  listTables,
  type VectorSearchOptions,
  type VectorSearchResult
} from 'ygo-search'

// カードをVector検索
const cards = await vectorSearchCards('墓地から特殊召喚', {
  limit: 10,
  threshold: 0.7,      // スコア閾値
  distanceType: 'cosine'  // cosine / l2 / dot
})

// FAQをVector検索
const faqs = await vectorSearchFaqs('チェーンブロック', {
  limit: 5
})

// 全テーブルを検索（cards, faqs, rulesなど全て）
const allResults = await vectorSearchAll('融合召喚', {
  limit: 10
})
// 結果: { cards: [...], faqs: [...], rules: [...] }

// カスタムテーブルを検索
const rulesResults = await searchTable('rules', 'ターンの流れ', {
  limit: 5,
  threshold: 0.6
})

// 利用可能なテーブル一覧を取得
const tables = await listTables()
// ['cards', 'faqs', 'rules', ...]

// 検索結果の型
interface VectorSearchResult {
  id: string
  text: string
  metadata: Record<string, any>
  score: number  // 距離スコア（小さいほど類似）
}
```

### 型定義

ライブラリは完全な型定義を提供しています：

```typescript
import type {
  // Card types
  Card,
  CardDetail,
  CardSearchParams,

  // FAQ types
  FAQRecord,
  SearchFAQParams,

  // Pattern types
  ExtractedPattern,
  ReplacementResult,

  // Vector search types
  VectorSearchResult,
  VectorSearchOptions,
  VectorRecord,
  GenericConversionOptions,

  // Format types
  Format
} from 'ygo-search'
```

### 環境変数

```typescript
// データディレクトリをカスタマイズ
process.env.YGO_SEARCH_WORKDIR = './custom-data'
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
ygo_search seek --help
ygo_search faq --help
ygo_search convert --help
ygo_search docs --help
```
