[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / judgeAndReplace

# Function: judgeAndReplace()

> **judgeAndReplace**(`text`, `options`): `Promise`\<[`ReplacementResult`](../interfaces/ReplacementResult.md)\>

Defined in: [lib/judge-and-replace.ts:95](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/judge-and-replace.ts#L95)

テキスト中のカードパターンを判定し、正規化された形式に置換する

## Parameters

### text

`string`

処理対象のテキスト

### options

[`JudgeAndReplaceOptions`](../interfaces/JudgeAndReplaceOptions.md) = `{}`

オプション

## Returns

`Promise`\<[`ReplacementResult`](../interfaces/ReplacementResult.md)\>

置換結果

## Example

```typescript
import { judgeAndReplace } from 'ygo-search'

const result = await judgeAndReplace('I use {ブルーアイズ*} and 《青眼の白龍》 cards')
console.log(result.processedText)
// "I use {{青眼の白龍|89631139}} and {{青眼の白龍|89631139}} cards"

// 《カード名》形式で置換
const result2 = await judgeAndReplace('Use {ブルーアイズ*}', { mountPar: true })
console.log(result2.processedText)
// "Use 《青眼の白龍》"
```
