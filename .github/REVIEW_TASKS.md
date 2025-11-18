# レビュー対応タスク

## 優先度: 高 🔴

### Task 1: judge-and-replace.ts のパフォーマンス改善
- [ ] 現在の個別プロセス生成を bulk-search-cards.ts 使用に変更
- [ ] 実装手順:
  1. [ ] 全パターンから検索クエリリストを作成
  2. [ ] bulk-search-cards.ts を一度だけ呼び出し
  3. [ ] 結果を元のパターンにマッピング
  4. [ ] 置換ロジックを適用
- [ ] テストで動作確認

## 優先度: 中 🟡

### Task 2: 型定義の追加
- [ ] Card インターフェースを定義 (schema.md に基づく)
- [ ] CardMatch.results の型を `any[]` から `Card[]` に変更
- [ ] pattern.type を明示的に型付け `'flexible' | 'exact' | 'cardId'`
- [ ] `as any` キャストを削除

### Task 3: コードの重複解消
- [ ] src/utils/pattern-extractor.ts を作成
- [ ] extractCardPatterns 関数を共有モジュールに移動
- [ ] オプションで startIndex を返すように実装
- [ ] extract-and-search-cards.ts から import
- [ ] judge-and-replace.ts から import
- [ ] 既存のテストが通ることを確認

## 完了後

- [ ] 全テスト実行 (unit + integration)
- [ ] git commit
- [ ] git push
- [ ] レビューコメントに返信

## 進捗

- [x] Task 1: パフォーマンス改善 (bulk-search-cards.ts使用に変更)
- [x] Task 2: 型定義 (Card, PatternType, ReplacementResult等追加)
- [x] Task 3: コード重複解消 (utils/pattern-extractor.ts作成)

---

# PR #2 レビュー対応タスク (2025-11-18)

## 優先度: 高 🔴

### Task 1: errorイベントハンドラ追加
- [ ] executeCLI関数に`child.on('error', ...)`を追加
- [ ] spawnが失敗した場合のエラーメッセージを返す
- [ ] プロミスがハングアップしないようにする

## 優先度: 中 🟡

### Task 2: 未使用のインポート削除
- [ ] `Card`型のインポートを削除（使用していない）

### Task 3: 未使用のインターフェース削除
- [ ] `SpawnResult`インターフェースを削除（使用していない）

### Task 4: READMEのパス表記改善
- [ ] `/absolute/path/to/...` → `<YOUR_ABSOLUTE_PATH>`に変更
- [ ] よりプレースホルダーとしてわかりやすく

## 進捗

- [x] Task 1: errorイベントハンドラ (✅ 追加完了)
- [x] Task 2: 未使用インポート削除 (✅ Card型削除)
- [x] Task 3: 未使用インターフェース削除 (✅ SpawnResult削除)
- [x] Task 4: README修正 (✅ プレースホルダー表記に変更)
