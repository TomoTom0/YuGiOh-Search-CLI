# TypeScript から MCP ツールを使う方法

## 概要

このMCPサーバーはTypeScriptから直接インポートして使用できます。

## セットアップ

```bash
# プロジェクトに追加
npm install ygo-search-card-mcp

# またはローカル開発の場合
npm link ygo-search-card-mcp
```

## インポート方法

```typescript
import { searchCards, bulkSearchCards } from 'ygo-search-card-mcp'
// または特定の関数のみ
import { searchCards } from 'ygo-search-card-mcp/dist/search-cards.js'
```

## 使用例

### 1. カード検索

```typescript
import { searchCards } from 'ygo-search-card-mcp'

async function example() {
  // 基本検索
  const results = await searchCards({
    name: '青眼の白龍'
  }, {
    cols: ['name', 'cardId', 'atk'],
    mode: 'exact'
  })
  
  console.log(results)
}
```

### 2. ワイルドカード検索

```typescript
import { searchCards } from 'ygo-search-card-mcp'

async function wildcardSearch() {
  // テキストに「破壊」を含むカード
  const results = await searchCards({
    text: '*破壊*'
  }, {
    cols: ['name', 'text'],
    flagAllowWild: true
  })
  
  return results
}
```

### 3. ネガティブ検索

```typescript
import { searchCards } from 'ygo-search-card-mcp'

async function negativeSearch() {
  // 「召喚」を含むが「無効」を含まないカード
  const results = await searchCards({
    text: '召喚 -"無効"'
  }, {
    cols: ['name', 'text'],
    flagAllowWild: true
  })
  
  return results
}
```

### 4. バルク検索

```typescript
import { bulkSearchCards } from 'ygo-search-card-mcp'

async function bulkSearch() {
  const queries = [
    { filter: { name: '青眼の白龍' }, cols: ['name', 'atk'] },
    { filter: { name: 'ブラック・マジシャン' }, cols: ['name', 'atk'] },
    { filter: { race: 'ドラゴン族', atk: '3000' }, cols: ['name', 'race', 'atk'] }
  ]
  
  const results = await bulkSearchCards(queries)
  
  // results: Array<Card[]>
  console.log(`Found ${results[0].length} Blue-Eyes cards`)
  console.log(`Found ${results[1].length} Dark Magician cards`)
  console.log(`Found ${results[2].length} 3000 ATK Dragon cards`)
}
```

### 5. パターン抽出と検索

```typescript
import { extractCardPatterns } from 'ygo-search-card-mcp/dist/utils/pattern-extractor.js'
import { searchCards } from 'ygo-search-card-mcp'

async function extractAndSearch(text: string) {
  // テキストからパターンを抽出
  const patterns = extractCardPatterns(text)
  
  // 各パターンで検索
  for (const pattern of patterns) {
    const results = await searchCards({
      name: pattern.query
    }, {
      mode: pattern.type === 'exact' ? 'exact' : 'partial'
    })
    
    console.log(`Pattern: ${pattern.pattern}`)
    console.log(`Results: ${results.length} cards`)
  }
}

// 使用例
extractAndSearch("{青眼}と《ブラック・マジシャン》を召喚")
```

### 6. judge_and_replace ロジック

```typescript
import { judgeAndReplace } from 'ygo-search-card-mcp/dist/judge-and-replace.js'

async function replaceCardNames(text: string) {
  const result = await judgeAndReplace(text)
  
  console.log('Original:', text)
  console.log('Replaced:', result.text)
  console.log('Warnings:', result.warnings)
  
  // 結果:
  // - 1件ヒット: {{カード名|カードID}}
  // - 複数件: {{`元表現`_`カード名|ID`_`カード名|ID`_...}}
  // - 0件: {{NOTFOUND_`元表現`}}
  
  return result
}
```

## 型定義

```typescript
import type { Card, SearchOptions, PatternType } from 'ygo-search-card-mcp'

interface SearchOptions {
  cols?: string[]
  mode?: 'exact' | 'partial'
  includeRuby?: boolean
  flagAutoPend?: boolean
  flagAutoSupply?: boolean
  flagAutoRuby?: boolean
  flagAutoModify?: boolean
  flagAllowWild?: boolean
  flagNearly?: boolean
}

interface Card {
  cardType: string
  name: string
  ruby?: string
  cardId: string
  ciid: string
  text?: string
  attribute?: string
  levelType?: string
  levelValue?: string
  race?: string
  atk?: string
  def?: string
  // ... その他のフィールド
}

type PatternType = 'flexible' | 'exact' | 'id'
```

## MCPサーバーを経由せずに使う

MCPサーバーを起動せずに、ライブラリとして直接使用する場合:

```typescript
import { loadCardDatabase } from 'ygo-search-card-mcp/dist/lib/db.js'
import { normalizeCardName } from 'ygo-search-card-mcp/dist/lib/normalize.js'

async function directDBAccess() {
  // データベースを直接ロード
  const cards = await loadCardDatabase()
  
  console.log(`Total cards: ${cards.length}`)
  
  // 正規化処理
  const normalized = normalizeCardName('青眼の白龍')
  console.log(normalized) // "アオメノハクリュウ"
}
```

## 注意事項

### ビルドが必要

TypeScriptから使用する場合も、事前に`npm run build`が必要です:

```bash
npm run build
```

### ES Modules

このパッケージはES Modulesを使用しています。インポート時は`.js`拡張子を明示してください:

```typescript
// ✅ 正しい
import { searchCards } from 'ygo-search-card-mcp/dist/search-cards.js'

// ❌ 間違い
import { searchCards } from 'ygo-search-card-mcp/dist/search-cards'
```

### データファイル

データファイル(`data/*.tsv`)が必要です:

```bash
bash scripts/setup/setup-data.sh
```

## トラブルシューティング

### ERR_MODULE_NOT_FOUND

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../pattern-extractor'
```

**解決策**: ビルドを実行してください:

```bash
npm run build
```

### データファイルが見つからない

```
Error: ENOENT: no such file or directory, open 'data/cardInfoAll.tsv'
```

**解決策**: データファイルをダウンロードしてください:

```bash
bash scripts/setup/setup-data.sh
```

## サンプルプロジェクト

完全なサンプルは`examples/`ディレクトリを参照してください:

```bash
cd examples
npm install
npm run example
```
