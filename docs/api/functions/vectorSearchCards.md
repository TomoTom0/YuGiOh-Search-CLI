[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / vectorSearchCards

# Function: vectorSearchCards()

> **vectorSearchCards**(`query`, `options`): `Promise`\<[`VectorSearchResult`](../interfaces/VectorSearchResult.md)[]\>

Defined in: [lib/vector/searcher.ts:144](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/vector/searcher.ts#L144)

Vector検索機能

## Parameters

### query

`string`

### options

`number` | [`VectorCardSearchOptions`](../interfaces/VectorCardSearchOptions.md)

## Returns

`Promise`\<[`VectorSearchResult`](../interfaces/VectorSearchResult.md)[]\>

## Example

```ts
import { vectorSearchCards, vectorSearchFaqs, vectorSearchAll, searchTable, listTables } from 'ygo-search'

// カード検索
const cardResults = await vectorSearchCards('墓地から特殊召喚', { limit: 5 })

// FAQ検索
const faqResults = await vectorSearchFaqs('チェーンブロック', { limit: 5 })

// 全体検索（全テーブル）
const allResults = await vectorSearchAll('融合召喚', { limit: 10 })
// { cards: [...], faqs: [...], rules: [...], ... }

// カスタムテーブル検索
const customResults = await searchTable('rules', 'ターン', { limit: 5 })

// テーブル一覧取得
const tables = await listTables()
```
