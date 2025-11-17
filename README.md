**search-cards CLI (machine-oriented spec)**

- CLI path: `scripts/mcp/search-cards.ts`
- Invocation pattern (example):
  - `node scripts/mcp/search-cards.ts '{"filter": {"name": "ヴァレット"}}' cols=name,cardId mode=partial`
  - `node scripts/mcp/search-cards.ts '{"filter": {"name": "ブルーアイズ*"}}' cols=name,cardId`

- Input contract (machine-friendly):
  - `filter` (object, required): mapping of column names to filter values. Values can be:
    - string or number: exact match (except `name` which can use `mode` or wildcards)
    - array: shorthand for OR of values
    - object: `{ "op": "and"|"or", "cond": [ ... ] }`
  - `cols` (array of strings, optional): columns to include in output; omit to return merged record
  - `mode` (string, optional): `exact` (default) | `partial`. `partial` applies only to `name`. Regex is not supported.
  - `flagAllowWild` (boolean, optional, default: true): When true, `*` acts as wildcard in name searches

- Wildcard support:
  - When `flagAllowWild=true` (default), `*` matches any characters in name field
  - Examples: "ブルーアイズ*", "*ドラゴン", "Evil*Twin*"
  - Works with `flagAutoModify` normalization
  - Cannot be used with `mode=partial`

- Output: JSON array of matched rows. Process exits non-zero and prints an error on invalid input.

- Additional files:
  - `scripts/mcp/search-cards.schema.json` — JSON Schema for programmatic validation
  - `scripts/mcp/search-cards.examples.json` — example request payloads

**extract-and-search-cards CLI**

- CLI path: `scripts/mcp/extract-and-search-cards.ts`
- Invocation pattern: `npx tsx scripts/mcp/extract-and-search-cards.ts <text>`

- Input: text string containing card name patterns
  - `{card-name}` - flexible search with wildcards and normalization
  - `《card-name》` - exact search with normalization
  - `{{card-name|cardId}}` - search by card ID

- Output: JSON object with `cards` array containing search results

- Example:
  ```bash
  npx tsx scripts/mcp/extract-and-search-cards.ts "Use {ブルーアイズ*} and 《青眼の白龍》"
  ```

