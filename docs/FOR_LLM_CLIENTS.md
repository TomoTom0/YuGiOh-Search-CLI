# LLMクライアント向け：tools/list の代替取得方法

## 問題

一部のLLMクライアントは：
- ✅ `tools/call` (ツール実行) ができる
- ❌ `tools/list` (定義取得) ができない

## 解決策

### 方法1: 手動でtools/listを取得

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  npx tsx src/ygo-search-card-server.ts > /tmp/tools-definition.json
```

この出力をLLMに渡す。

### 方法2: 定義を直接提供

**search_cards のパラメータ:**

```json
{
  "filter": {
    "type": "object",
    "description": "Filter conditions. Example: {name: 'Blue-Eyes White Dragon'} or {text: '*destroy*'}"
  },
  "cols": {
    "type": "array",
    "description": "Columns to return. Available: name, cardId, text, attribute, race, atk, def, etc."
  },
  "outputPath": {
    "type": "string",
    "description": "Filename or absolute path. If relative, combined with outputDir/YGO_OUTPUT_DIR/cwd. Auto-generates if omitted."
  },
  "outputDir": {
    "type": "string", 
    "description": "Directory for output. Priority: 1) This param, 2) YGO_OUTPUT_DIR env, 3) cwd."
  }
}
```

### 方法3: 直接CLIを使う（推奨）

```bash
# ファイルに保存
npx tsx src/ygo-search-card-server.ts << 'INPUT'
{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_cards","arguments":{"filter":{"name":"青眼"},"cols":["name","cardId"],"outputPath":"results.jsonl"}}}
INPUT

# または直接実行
npx tsx src/search-cards.ts '{"name":"青眼"}' cols=name,cardId outputPath=results.jsonl
```

## 環境変数

```bash
# 出力先ディレクトリをデフォルト指定
export YGO_OUTPUT_DIR=/path/to/output

# こうすると outputDir を省略可能
search_cards(filter={...}, outputPath="result.jsonl")
# → /path/to/output/result.jsonl に保存される
```

## 全ツール一覧

1. **search_cards** - カード検索
2. **bulk_search_cards** - 複数条件での一括検索
3. **extract_and_search_cards** - テキストからカード名抽出＋検索
4. **judge_and_replace_cards** - カード名抽出＋検証＋置換
5. **convert_file_formats** - フォーマット変換 (json/jsonl/yaml/jsonc)

すべて `outputPath` と `outputDir` をサポート。

## LLMクライアント開発者へ

**tools/list の実装をお願いします。**

MCP仕様では `tools/list` は必須機能です：
- https://spec.modelcontextprotocol.io/specification/server/tools/

現状、多くのLLMクライアントが：
- ✅ tools/call を実装
- ❌ tools/list を未実装

これによりLLMはツールの定義を自動取得できず、ユーザーが手動で教える必要があります。

### 最小限の実装例

```typescript
async function getToolsList(serverName: string) {
  const request = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list"
  };
  
  const response = await mcpClient.request(serverName, request);
  return response.result.tools; // [{name, description, inputSchema}, ...]
}
```

これだけでLLMは全ツール定義を自動取得できます。
