[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / convertGenericToJsonl

# Function: convertGenericToJsonl()

> **convertGenericToJsonl**(`inputPath`, `outputPath`, `options?`): `Promise`\<`number`\>

Defined in: [lib/vector/converter.ts:405](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/vector/converter.ts#L405)

Vector DBインデックス構築とデータ変換機能

## Parameters

### inputPath

`string`

### outputPath

`string`

### options?

[`GenericConversionOptions`](../interfaces/GenericConversionOptions.md)

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
