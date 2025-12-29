[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / convertFaqsToJsonl

# Function: convertFaqsToJsonl()

> **convertFaqsToJsonl**(`tsvPath`, `outputPath`): `Promise`\<`number`\>

Defined in: [lib/vector/converter.ts:262](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/vector/converter.ts#L262)

Vector DBインデックス構築とデータ変換機能

## Parameters

### tsvPath

`string`

### outputPath

`string`

## Returns

`Promise`\<`number`\>

## Example

```ts
import { convertCardsToJsonl, convertFaqsToJsonl, convertGenericToJsonl, indexFromJsonl } from 'ygo-search'

// カードデータをJSONLに変換
const count = await convertCardsToJsonl('cards.tsv', 'detail.tsv', 'cards.jsonl')

// FAQデータをJSONLに変換
const faqCount = await convertFaqsToJsonl('faqs.tsv', 'faqs.jsonl')

// 汎用データをJSONLに変換
const genericCount = await convertGenericToJsonl('data.json', 'output.jsonl', {
  excludeColumns: ['cite', 'sourceFile']
})

// Vector DBインデックスを構築
await indexFromJsonl('cards', 'cards.jsonl')
```
