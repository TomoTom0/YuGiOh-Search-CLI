[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / extractAndSearchCards

# Function: extractAndSearchCards()

> **extractAndSearchCards**(`text`): `Promise`\<[`CardMatch`](../interfaces/CardMatch.md)[]\>

Defined in: [lib/extract-and-search-cards.ts:93](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/extract-and-search-cards.ts#L93)

テキスト中のカードパターンを抽出し、各パターンに対応するカード情報を検索する

## Parameters

### text

`string`

処理対象のテキスト

## Returns

`Promise`\<[`CardMatch`](../interfaces/CardMatch.md)[]\>

カードマッチの配列

## Example

```typescript
import { extractAndSearchCards } from 'ygo-search'

const cards = await extractAndSearchCards('I use {ブルーアイズ*} and 《青眼の白龍》 cards')
console.log(cards)
// [
//   {
//     pattern: '{ブルーアイズ*}',
//     type: 'flexible',
//     query: 'ブルーアイズ*',
//     results: [{ name: '青眼の白龍', cardId: 89631139, ... }]
//   },
//   {
//     pattern: '《青眼の白龍》',
//     type: 'exact',
//     query: '青眼の白龍',
//     results: [{ name: '青眼の白龍', cardId: 89631139, ... }]
//   }
// ]
```
