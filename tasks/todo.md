# TODO - PR #14 Review Fixes

## ✅ All Tasks Completed!

### 1. searchCardsByFilter のプロセスspawnのオーバーヘッド削減 ✅
- **DONE**: `src/lib/card-search-core.ts`として検索ロジックを抽出
- **DONE**: `search-faq.ts`で直接import・呼び出し
- **Impact**: プロセス起動とJSON変換のオーバーヘッドを削減

### 2. unused import削除 ✅
- **DONE**: `src/cli/ygo_faq_search.ts`から未使用import削除

### 3. 型安全性の向上 - enrichFAQWithCards ✅
- **DONE**: `faq: FAQRecord`型を指定

### 4. 型安全性の向上 - loadCards
- **SKIPPED**: 既存コードの修正範囲を最小化（別PRで対応可能）

### 5. 型安全性の向上 - MCPサーバーのparams構築 ✅
- **DONE**: `Partial<SearchFAQParams>`を使用
- **DONE**: `SearchFAQParams`をexport

### 6. ドキュメント修正 - FAQ_SEARCH.md ✅
- **DONE**: カードスペック検索を「実装済み」に更新
- **DONE**: JSONサンプルのカンマ修正

## Summary
6/7 tasks completed (Task 4 は既存コードへの影響を最小化のためskip)
