[**ygo-search v1.3.0**](../README.md)

***

[ygo-search](../README.md) / SeekCardsOptions

# Interface: SeekCardsOptions

Defined in: [lib/seek-cards.ts:11](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/seek-cards.ts#L11)

## Properties

### max?

> `optional` **max**: `number`

Defined in: [lib/seek-cards.ts:16](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/seek-cards.ts#L16)

最大取得件数

#### Default

```ts
10
```

***

### random?

> `optional` **random**: `boolean`

Defined in: [lib/seek-cards.ts:22](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/seek-cards.ts#L22)

ランダムに選択するかどうか

#### Default

```ts
true
```

***

### range?

> `optional` **range**: \[`number`, `number`\]

Defined in: [lib/seek-cards.ts:28](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/seek-cards.ts#L28)

cardIdの範囲指定 [start, end]

#### Example

```ts
[4000, 5000]
```

***

### all?

> `optional` **all**: `boolean`

Defined in: [lib/seek-cards.ts:35](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/seek-cards.ts#L35)

範囲内の全カードを取得（maxを無視）
rangeと併用する必要がある

#### Default

```ts
false
```

***

### cols?

> `optional` **cols**: `string`[]

Defined in: [lib/seek-cards.ts:41](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/seek-cards.ts#L41)

取得するカラム

#### Default

```ts
['cardId', 'name']
```

***

### colAll?

> `optional` **colAll**: `boolean`

Defined in: [lib/seek-cards.ts:47](https://github.com/TomoTom0/YuGiOh-Search-CLI/blob/main/src/lib/seek-cards.ts#L47)

全カラムを取得

#### Default

```ts
false
```
