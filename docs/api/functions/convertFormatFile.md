[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / convertFormatFile

# Function: convertFormatFile()

> **convertFormatFile**(`inputPath`, `outputPath`): `Promise`\<`void`\>

Defined in: [lib/format-converter.ts:153](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/format-converter.ts#L153)

ファイル間でフォーマット変換を実行する

## Parameters

### inputPath

`string`

入力ファイルパス

### outputPath

`string`

出力ファイルパス

## Returns

`Promise`\<`void`\>

## Example

```typescript
import { convertFormatFile } from 'ygo-search'

// JSON -> JSONL変換
await convertFormatFile('input.json', 'output.jsonl')

// YAML -> JSON変換
await convertFormatFile('config.yaml', 'config.json')
```
