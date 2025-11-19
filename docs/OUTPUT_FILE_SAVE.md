# Output File Save Feature

MCPツールの実行結果をファイルに保存できます。

## 機能

### すべての検索ツールで利用可能

- `search_cards`
- `bulk_search_cards`
- `extract_and_search_cards`
- `judge_and_replace_cards`

## パラメータ

### `outputPath` (optional)
ファイル名または絶対パス。

- **ファイル名のみ**: `result.jsonl`
  - `outputDir`または`YGO_OUTPUT_DIR`環境変数で指定したディレクトリに保存
- **絶対パス**: `/path/to/output/result.jsonl`
  - 指定したパスに直接保存

### `outputDir` (optional)
出力ディレクトリ。

- 指定がない場合: `YGO_OUTPUT_DIR`環境変数を使用
- 環境変数もない場合: カレントディレクトリ

### 自動ファイル名生成
`outputDir`のみ指定して`outputPath`を省略すると、タイムスタンプから自動生成：
```
ygo-search-2025-11-17T21-12-02.jsonl
```

## 出力形式

すべての結果は**JSONL**形式で保存されます。
- 1行につき1つのJSONオブジェクト
- パース・処理が容易
- 大きなデータセットに適している

## 使用例

### 例1: ファイル名のみ指定
```typescript
{
  filter: {name: "青眼"},
  outputPath: "blue-eyes.jsonl"
}
```
→ カレントディレクトリまたは`YGO_OUTPUT_DIR`に`blue-eyes.jsonl`を保存

### 例2: ディレクトリのみ指定（自動ファイル名）
```typescript
{
  filter: {text: "*破壊*"},
  outputDir: "./results"
}
```
→ `./results/ygo-search-2025-11-17T21-12-02.jsonl`

### 例3: 絶対パス指定
```typescript
{
  filter: {cardType: "Monster"},
  outputPath: "/tmp/monsters.jsonl"
}
```
→ `/tmp/monsters.jsonl`

### 例4: 環境変数使用
```bash
export YGO_OUTPUT_DIR=/home/user/ygo-results
```
```typescript
{
  filter: {race: "ドラゴン族"},
  outputPath: "dragons.jsonl"
}
```
→ `/home/user/ygo-results/dragons.jsonl`

## レスポンス

ファイル保存が有効な場合、結果の最後に保存先パスが追加されます：

```
[検索結果のJSON]

✅ Saved to: /path/to/output/file.jsonl
```

## フォーマット変換ツール

### `convert_file_formats`

JSON, JSONL, JSONC, YAMLの相互変換を行います。

#### パラメータ

```typescript
{
  conversions: [
    {
      input: "input.json",   // 入力ファイルパス（形式は拡張子から自動判定）
      output: "output.jsonl"  // 出力ファイルパス（形式は拡張子から自動判定）
    }
  ]
}
```

#### サポート形式

- `.json` - 標準JSON
- `.jsonl` - JSON Lines (1行1オブジェクト)
- `.jsonc` - コメント付きJSON
- `.yaml`, `.yml` - YAML形式

#### 使用例

##### 単一変換
```typescript
{
  conversions: [
    {
      input: "/path/to/data.json",
      output: "/path/to/data.jsonl"
    }
  ]
}
```

##### 複数同時変換
```typescript
{
  conversions: [
    {
      input: "search-results.jsonl",
      output: "search-results.yaml"
    },
    {
      input: "config.yaml",
      output: "config.json"
    },
    {
      input: "data.json",
      output: "data.jsonc"
    }
  ]
}
```

#### 変換の組み合わせ例

| 変換元 | 変換先 | 用途 |
|--------|--------|------|
| JSON → JSONL | 配列を行区切りに | 大量データ処理 |
| JSONL → JSON | 行区切りを配列に | 一括読み込み |
| JSON → YAML | 人間が読みやすく | 設定ファイル |
| YAML → JSON | プログラム処理用 | API連携 |
| JSON → JSONC | コメント追加 | ドキュメント化 |

## ワークフロー例

### 1. 検索 → 保存 → 変換
```typescript
// 1. カードを検索してJSONLで保存
search_cards({
  filter: {race: "魔法使い族"},
  outputDir: "./results"
})
// → ./results/ygo-search-2025-11-17T21-12-02.jsonl

// 2. YAMLに変換して確認しやすく
convert_file_formats({
  conversions: [{
    input: "./results/ygo-search-2025-11-17T21-12-02.jsonl",
    output: "./results/magicians.yaml"
  }]
})
```

### 2. バルク検索 → 複数形式で保存
```typescript
// バルク検索
bulk_search_cards({
  queries: [...],
  outputPath: "bulk-results.jsonl"
})

// 複数形式に変換
convert_file_formats({
  conversions: [
    {input: "bulk-results.jsonl", output: "bulk-results.json"},
    {input: "bulk-results.jsonl", output: "bulk-results.yaml"}
  ]
})
```

## CLI直接使用

### 検索結果を保存
```bash
# 環境変数設定
export YGO_OUTPUT_DIR=./search-results

# 検索（ツールからoutputDirを渡す）
```

### フォーマット変換
```bash
ygo_convert \
  input1.json:output1.jsonl \
  input2.yaml:output2.json \
  input3.jsonl:output3.yaml
```

## ディレクトリ構造例

```
project/
├── search-results/
│   ├── ygo-search-2025-11-17T21-12-02.jsonl
│   ├── dragons.jsonl
│   └── magicians.yaml
├── converted/
│   ├── data.json
│   ├── data.jsonl
│   └── data.yaml
└── ...
```

## 注意事項

- ディレクトリが存在しない場合、自動的に作成されます
- 既存ファイルは上書きされます
- JSONL形式は大量データに適していますが、人間が読むにはやや不便です
  - 読みやすさが必要な場合はYAMLに変換してください
- パスはUTF-8エンコーディングである必要があります
