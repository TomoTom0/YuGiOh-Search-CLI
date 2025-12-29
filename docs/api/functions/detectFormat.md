[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / detectFormat

# Function: detectFormat()

> **detectFormat**(`filename`): [`Format`](../type-aliases/Format.md)

Defined in: [lib/format-converter.ts:30](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/format-converter.ts#L30)

ファイル拡張子からフォーマットを検出する

## Parameters

### filename

`string`

ファイル名

## Returns

[`Format`](../type-aliases/Format.md)

検出されたフォーマット

## Example

```typescript
import { detectFormat } from 'ygo-search'

const format = detectFormat('data.jsonl')
// 'jsonl'
```
