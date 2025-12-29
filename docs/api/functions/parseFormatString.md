[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / parseFormatString

# Function: parseFormatString()

> **parseFormatString**(`content`, `format`): `any`

Defined in: [lib/format-converter.ts:56](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/format-converter.ts#L56)

フォーマット文字列をパースする

## Parameters

### content

`string`

パース対象の文字列

### format

[`Format`](../type-aliases/Format.md)

入力フォーマット

## Returns

`any`

パースされたデータ

## Example

```typescript
import { parseFormatString } from 'ygo-search'

const data = parseFormatString('{"key": "value"}', 'json')
// { key: 'value' }

const jsonlData = parseFormatString('{"a":1}\n{"b":2}', 'jsonl')
// [{ a: 1 }, { b: 2 }]
```
