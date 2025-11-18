# PR #4 レビュー指摘事項

## 概要
PR: https://github.com/TomoTom0/ygo-db-local-mcp/pull/4
レビュアー: gemini-code-assist
日時: 2025-11-17

## レビュー指摘

### 1. 🔴 Critical: YAMLパーサーの置き換え (src/format-converter.ts:103)

**問題点:**
- 自作のYAMLパーサーは標準機能（ネスト、複数行、アンカー等）未対応
- 複雑なYAMLファイルでエラーやデータ損失の可能性
- `convertToYaml`も`JSON.stringify`で処理しており不適切

**対応:**
- [ ] `js-yaml` または `yaml` ライブラリに置き換え
- [ ] parseFile()内のyamlケースを修正
- [ ] formatOutput()内のyamlケースを修正

---

### 2. 🟠 High: タイムスタンプ生成のバグ (src/ygo-search-card-server.ts:26)

**問題点:**
- 現在: `2025-11-17T21:12:02.123Z` → `2025-11-17T21-12-02-123Z` → `2025-11-17T21-12-0` (末尾5文字削除でバグ)
- 秒の1桁目が欠ける不正なファイル名が生成される

**対応:**
- [ ] sliceとreplaceの順序を修正

---

### 3. 🟡 Medium: JSONCパーサーの安全性 (src/format-converter.ts:29)

**問題点:**
- 正規表現でのコメント削除は文字列リテラル内の`//`や`/*`を誤認識
- 例: `{"url": "http://example.com"}` でバグる

**対応:**
- [ ] `jsonc-parser` ライブラリに置き換え

---

### 4. 🟡 Medium: コードの重複 (src/ygo-search-card-server.ts:127)

**問題点:**
- `search_cards`, `bulk_search_cards`, `extract_and_search_cards`, `judge_and_replace_cards` でファイル保存ロジックが重複
- メンテナンス性低下

**対応:**
- [ ] 共通ヘルパー関数 `executeAndSave()` を作成
- [ ] 各ツールで共通関数を呼び出すようリファクタリング

---

## 対応優先度

1. **Critical** - YAMLパーサー置き換え (必須)
2. **High** - タイムスタンプバグ修正 (必須)
3. **Medium** - JSONCパーサー置き換え (推奨)
4. **Medium** - コード重複の解消 (推奨)

## 依存ライブラリ追加

```bash
npm install js-yaml jsonc-parser
npm install --save-dev @types/js-yaml
```

## 対応状況

- [x] レビュー指摘1 (Critical) - YAML
- [x] レビュー指摘2 (High) - タイムスタンプ
- [x] レビュー指摘3 (Medium) - JSONC
- [x] レビュー指摘4 (Medium) - リファクタリング
- [x] テスト実行確認
- [x] レビュー指摘にコメント返信
- [x] PR4マージ完了

## 追加対応 (2025-11-18)

### tsx依存の完全削除

**問題:**
- ERR_MODULE_NOT_FOUND: pattern-extractorモジュールが見つからない
- 実行時にtsxが必要だった
- ES Modulesでは相対importに`.js`拡張子が必須

**対応:**
- [x] すべての相対importに`.js`拡張子を追加
- [x] スクリプトパスを`.ts`→`.js`に変更
- [x] MCP server: `npx tsx` → `node`に変更
- [x] ビルド確認・動作テスト
- [x] コミット: f47614a

**結果:**
- ✅ `npm run build`後、tsxなしで全コマンド動作
- ✅ `ygo_extract`、`ygo_search`、`ygo_convert`正常動作
- ✅ MCPサーバーからも正常に各スクリプトを呼び出せる
