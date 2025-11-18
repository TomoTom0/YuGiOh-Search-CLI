# PR #6 Review Comments - タスクリスト

## 概要
PR #6 に対するレビューコメントへの対応タスクリスト。
主にtsxからnodeへの移行が不完全な箇所と、エラーハンドリングの改善が指摘されている。

## タスクリスト

### Critical 優先度

- [x] **bulk-search-cards.ts (Line 51)**: `spawn`呼び出しで`npx tsx`を`node`に変更
  - Comment ID: 2536514769
  - 対応完了: `node`に変更してtsxランタイム依存を削除

- [x] **extract-and-search-cards.ts (Line 48)**: `spawn`呼び出しで`npx tsx`を`node`に変更
  - Comment ID: 2536514782
  - 対応完了: `node`に変更してtsxランタイム依存を削除

- [x] **judge-and-replace.ts (Line 53)**: `spawn`呼び出しで`npx tsx`を`node`に変更
  - Comment ID: 2536514790
  - 対応完了: `node`に変更してtsxランタイム依存を削除

### High 優先度

- [x] **search-cards.ts (Line 226)**: プロジェクトルート検出失敗時のエラーハンドリング追加
  - Comment ID: 2536514799
  - 対応完了: package.jsonが見つからない場合に明示的なエラーを投げる実装を追加

### Medium 優先度

- [x] **search-cards.ts (Line 222)**: 同期的な`fs.readFileSync`を非同期`fs.promises.readFile`に変更
  - Comment ID: 2536507770
  - 対応完了: `await fs.promises.readFile`に変更してイベントループをブロックしない

## 対応後の確認

- [x] npm run build が成功する
- [ ] npm test が成功する (integration testはdata filesが必要)
- [ ] 各レビューコメントに対して返信済み
- [ ] GitHub Actions が成功する

## 備考

- Integration テストは data files が必要なため、ローカル環境では失敗する可能性がある
- Unit テストはすべてパス (55 passed)
- GitHub Actions でのテスト実行で確認予定
