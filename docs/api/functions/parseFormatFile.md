[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / parseFormatFile

# Function: parseFormatFile()

> **parseFormatFile**(`filePath`, `format`): `Promise`\<`any`\>

Defined in: [lib/format-converter.ts:92](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/format-converter.ts#L92)

ファイルを読み込んでパースする

## Parameters

### filePath

`string`

ファイルパス

### format

[`Format`](../type-aliases/Format.md)

入力フォーマット

## Returns

`Promise`\<`any`\>

パースされたデータ

## Example

```typescript
import { parseFormatFile } from 'ygo-search'

const data = await parseFormatFile('data.json', 'json')
```
