[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / extractCardPatterns

# Function: extractCardPatterns()

> **extractCardPatterns**(`text`, `options`): [`ExtractedPattern`](../interfaces/ExtractedPattern.md)[]

Defined in: [utils/pattern-extractor.ts:15](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/utils/pattern-extractor.ts#L15)

Extract card name patterns from text
Supports {card-name} (flexible), 《card-name》 (exact), and {{card-name|cardId}} (by ID)

## Parameters

### text

`string`

Text containing card name patterns

### options

[`ExtractOptions`](../interfaces/ExtractOptions.md) = `{}`

Options for extraction

## Returns

[`ExtractedPattern`](../interfaces/ExtractedPattern.md)[]

Array of extracted patterns
