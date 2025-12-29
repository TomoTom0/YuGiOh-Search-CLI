[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / searchFAQ

# Function: searchFAQ()

> **searchFAQ**(`params`): `Promise`\<[`FAQSearchResult`](../interfaces/FAQSearchResult.md)[]\>

Defined in: [search-faq.ts:75](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/search-faq.ts#L75)

FAQ検索機能

## Parameters

### params

[`SearchFAQParams`](../interfaces/SearchFAQParams.md)

## Returns

`Promise`\<[`FAQSearchResult`](../interfaces/FAQSearchResult.md)[]\>

## Example

```ts
import { searchFAQ } from 'ygo-search'

const results = await searchFAQ({
  cardName: '青眼の白龍',
  limit: 10
})
```
