# Pending Reviews & Decisions

## Open Pull Requests

### PR #34 - Dev → Main
- **Status**: REVIEW IN PROGRESS
- **Reviewer**: gemini-code-assist[bot]
- **Issues**: 5 items (3 completed, 2 pending)
  - ✅ 指摘#2: switch文への変更 (完了)
  - ✅ 指摘#3: マジックナンバーの説明 (完了)
  - ✅ 指摘#4: パフォーマンス注意書き (完了)
  - ⏸️ 指摘#1: buildスクリプトの複雑性 (対応不要と判断)
  - 📋 指摘#5: parseArgsリファクタリング (v1.4.0で対応予定)
- **Next Action**: 残りの指摘への対応（v1.4.0で）
- **Analysis**: `tmp/pr/34/analysis.md`
- **Branch**: dev → main

### PR #14 - FAQ Search Feature
- **Status**: AWAITING REVIEW FIXES
- **Reviewer**: gemini-code-assist[bot]
- **Issues**: 7 items (1 high, 6 medium)
- **Next Action**: Address review comments
- **Link**: https://github.com/TomoTom0/ygo-db-local-mcp/pull/14

### PR #13 - Documentation Updates
- **Status**: REVIEW FIXES COMPLETED
- **Reviewer**: gemini-code-assist[bot]
- **Issues**: Fixed (5 items)
- **Next Action**: Wait for re-review
- **Link**: https://github.com/TomoTom0/ygo-db-local-mcp/pull/13

## Decisions Needed

### 1. Library API Support
- **Question**: TypeScript利用者向けのライブラリAPIを正式サポートするか？
- **Context**: TYPESCRIPT_FROM_TS.mdを削除（package.jsonにexportsなし）
- **Options**:
  - A: 現状維持（CLIとMCPのみサポート）
  - B: package.jsonにexports追加してライブラリ化
- **Priority**: Low
- **Decision By**: Future milestone

### 2. Bulk FAQ Search
- **Question**: バルクFAQ検索機能を実装するか？
- **Context**: Phase 3 in TASKS_FAQ.md
- **Impact**: 複数検索を一度に実行できる
- **Priority**: Medium
- **Decision By**: After v1.1.0 release

### 3. Performance Optimization
- **Question**: さらなるパフォーマンス最適化が必要か？
- **Context**: 現状でも十分高速だが改善の余地あり
- **Options**:
  - A: SQLiteインメモリDB導入
  - B: 全文検索エンジン（MiniSearch/Lunr.js）
  - C: 現状維持
- **Priority**: Low
- **Decision By**: Based on user feedback

## Blocked Tasks
（現在ブロックされているタスクはありません）
