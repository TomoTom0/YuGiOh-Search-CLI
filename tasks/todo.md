# TODO

## PR #34 Review Fixes (Current)

### 軽微な修正 - ✅ 完了 (2025-12-07)
- [x] 指摘#2: switch文への変更 (ygo_bulk_search.ts)
- [x] 指摘#3: マジックナンバーの説明コメント追加 (search-cards.ts)
- [x] 指摘#4: パフォーマンス注意書き追加 (search-cards.ts)

### 指摘#1: buildスクリプトの複雑性
- [x] 技術的分析完了
- [x] **結論**: 対応不要（SWCの仕様上、現在の実装が最適）
- **詳細**: `tmp/pr/34/analysis.md` 参照

### 指摘#5: parseArgs関数のリファクタリング
- [x] 技術的分析完了
- [x] 実装計画策定（3フェーズ）
- [ ] **対応**: 今すぐ実施
- **詳細**: `tmp/pr/34/analysis.md` 参照

## Next Actions

### ✅ 完了
- [x] PR #34の軽微な修正3件をコミット
- [x] gh-replyで対応状況を報告
- [x] PR #35作成（軽微な修正3件）

### ✅ 完了: parseArgs関数リファクタリング
- [x] フェーズ1: setOptionヘルパー作成（完了）
  - [x] setOption関数の実装
  - [x] 重複したswitch文の統一（~100行の重複削減）
  - [x] テスト実行・ビルド確認
- [x] フェーズ2: パース処理の分割（完了）
  - [x] parseFlagFormat関数の作成
  - [x] parseKeyValueFormat関数の作成
  - [x] parseJsonFormat関数の作成
  - [x] 既存テストで検証
- [x] フェーズ3: テストカバレッジ確認（完了）
  - [x] 既存テストで十分なカバレッジ確認
  - [x] 81個のテストが成功

### 次のアクション
- [ ] リファクタリングをコミット
- [ ] PR #35に追加プッシュ
