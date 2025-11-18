# MCP仕様の引用

## MCPプロトコル仕様より

### tools/list メソッド

**目的**: クライアントがサーバーの提供するツールを発見する

**レスポンス**:
```json
{
  "tools": [
    {
      "name": "tool_name",
      "description": "What the tool does",
      "inputSchema": {
        "type": "object",
        "properties": {
          "param1": {
            "type": "string",
            "description": "Parameter 1 description"
          },
          "param2": {
            "type": "number",
            "description": "Parameter 2 description"
          }
        },
        "required": ["param1"]
      }
    }
  ]
}
```

**inputSchema**: JSON Schema形式で**全パラメータの完全な定義**を含む
- パラメータ名
- 型（string, number, boolean, object, array, etc）
- 説明文
- 必須/オプショナル
- デフォルト値
- 列挙値
- バリデーション制約

## つまり

- ✅ tools/list = ツールの**引数一覧**を返す
- ✅ inputSchema = **各引数の完全な定義**
- ✅ 自動ディスカバリー = これがまさにその機能

## LLMの誤解

❌ 「引数一覧を自動的に引き出せない」
✅ 実際: tools/list のレスポンスに全て含まれている

## 参考

https://spec.modelcontextprotocol.io/specification/server/tools/
