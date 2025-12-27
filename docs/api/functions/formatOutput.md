[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / formatOutput

# Function: formatOutput()

> **formatOutput**(`data`, `format`): `string`

Defined in: [lib/format-converter.ts:115](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/format-converter.ts#L115)

データを指定フォーマットに変換する

## Parameters

### data

`any`

変換対象のデータ

### format

[`Format`](../type-aliases/Format.md)

出力フォーマット

## Returns

`string`

フォーマット済み文字列

## Example

```typescript
import { formatOutput } from 'ygo-search'

const jsonString = formatOutput({ key: 'value' }, 'json')
// '{\n  "key": "value"\n}'

const yamlString = formatOutput({ key: 'value' }, 'yaml')
// 'key: value\n'
```
