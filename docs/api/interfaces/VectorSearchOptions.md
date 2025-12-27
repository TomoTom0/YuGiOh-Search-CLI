[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / VectorSearchOptions

# Interface: VectorSearchOptions

Defined in: [lib/vector/searcher.ts:14](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/vector/searcher.ts#L14)

## Extended by

- [`VectorCardSearchOptions`](VectorCardSearchOptions.md)
- [`VectorFaqSearchOptions`](VectorFaqSearchOptions.md)

## Properties

### limit?

> `optional` **limit**: `number`

Defined in: [lib/vector/searcher.ts:15](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/vector/searcher.ts#L15)

***

### distanceType?

> `optional` **distanceType**: `"l2"` \| `"cosine"` \| `"dot"`

Defined in: [lib/vector/searcher.ts:16](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/vector/searcher.ts#L16)

***

### threshold?

> `optional` **threshold**: `number`

Defined in: [lib/vector/searcher.ts:17](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/vector/searcher.ts#L17)

***

### filter?

> `optional` **filter**: `Record`\<`string`, `any`\>

Defined in: [lib/vector/searcher.ts:18](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/vector/searcher.ts#L18)

***

### exclude?

> `optional` **exclude**: `object`

Defined in: [lib/vector/searcher.ts:19](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/vector/searcher.ts#L19)

#### ids?

> `optional` **ids**: `string`[]

#### faqIds?

> `optional` **faqIds**: `string`[]

#### categories?

> `optional` **categories**: `string`[]
