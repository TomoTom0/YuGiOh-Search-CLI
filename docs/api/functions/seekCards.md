[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / seekCards

# Function: seekCards()

> **seekCards**(`options`): `Promise`\<`Record`\<`string`, `string`\>[]\>

Defined in: [lib/seek-cards.ts:82](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/seek-cards.ts#L82)

ランダムまたは範囲指定でカードを取得する

## Parameters

### options

[`SeekCardsOptions`](../interfaces/SeekCardsOptions.md) = `{}`

取得オプション

## Returns

`Promise`\<`Record`\<`string`, `string`\>[]\>

カード情報の配列

## Example

```typescript
import { seekCards } from 'ygo-search'

// ランダムに10件取得
const cards = await seekCards()

// 範囲指定で20件取得
const rangeCards = await seekCards({
  range: [4000, 5000],
  max: 20
})

// 範囲内の全カードを取得
const allCards = await seekCards({
  range: [4000, 5000],
  all: true
})

// 特定のカラムのみ取得
const detailCards = await seekCards({
  max: 5,
  cols: ['cardId', 'name', 'atk', 'def']
})
```
