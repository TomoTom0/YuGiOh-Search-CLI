# Branch Protection Rules

このリポジトリでは、コード品質を保つために以下のブランチ保護ルールを設定しています。

## 保護対象ブランチ

### `main` ブランチ
- ✅ **直接push禁止**
- ✅ **PRからのみマージ可能**
- ✅ **PRは`dev`ブランチからのみ許可**
- ✅ **GitHub Actions `test`の成功が必須**
- ✅ **レビューコメントの解消が必須**
- ❌ **Approve（承認）は不要**
- ✅ **Force push禁止**
- ✅ **ブランチ削除禁止**

### `dev` ブランチ
- ✅ **直接push禁止**
- ✅ **PRからのみマージ可能**
- ✅ **featureブランチからのPRを受け付け**
- ✅ **GitHub Actions `test`の成功が必須**
- ✅ **レビューコメントの解消が必須**
- ❌ **Approve（承認）は不要**
- ✅ **Force push禁止**
- ✅ **ブランチ削除禁止**

## ワークフロー

```
feature/* → dev → main
```

### 開発フロー

1. **機能開発**: `feature/*` ブランチで開発
2. **dev へPR**: `feature/*` → `dev`
   - テストが通ること
   - レビュー指摘をすべて解消すること
3. **main へPR**: `dev` → `main`
   - devブランチからのみ可能
   - テストが通ること
   - レビュー指摘をすべて解消すること

## GitHub Actions

### 必須チェック: `test`
- **ユニットテスト**: `npm run test:unit`
- **統合テスト**: `npm run test:integration`
- すべてのテストが成功する必要があります

### PR検証: `PR Validation`
- mainへのPRがdevブランチからのみであることを確認
- 他のブランチからのPRは自動的に失敗します

## ルール詳細

### required_status_checks
```json
{
  "strict": true,
  "contexts": ["test"]
}
```
- PRをマージする前に最新のベースブランチとの統合が必要
- `test` ワークフローの成功が必須

### required_pull_request_reviews
```json
{
  "required_approving_review_count": 0
}
```
- レビュー承認は不要
- ただし、レビューコメントの解消は必須

### required_conversation_resolution
- すべてのレビューコメントスレッドが解決済みである必要があります

### enforce_admins
- 管理者も含めてすべてのユーザーにルールが適用されます

### restrictions
- 特定のユーザーやチームに限定したpush許可は設定していません

## 設定確認

```bash
# main ブランチの保護設定を確認
gh api repos/{owner}/{repo}/branches/main/protection

# dev ブランチの保護設定を確認
gh api repos/{owner}/{repo}/branches/dev/protection
```

## トラブルシューティング

### "Required status check "test" is expected"
→ `.github/workflows/test.yml` が実行されていることを確認

### "All conversations must be resolved"
→ PRのすべてのレビューコメントに返信し、解決済みにする

### "Pull request must be from dev branch"
→ mainへのPRはdevブランチからのみ可能です
