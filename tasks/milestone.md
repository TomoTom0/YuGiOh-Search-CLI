# Milestones

## v1.1.0 - FAQ Search Feature (Target: 2025-11-19)
- [x] Core FAQ search implementation
- [x] CLI integration
- [x] MCP integration
- [ ] Review fixes for PR #14
- [ ] Merge to dev

### Status
- **Progress**: 90%
- **Blockers**: PR #14 review comments (7 items)
- **ETA**: 1 day

## v1.0.0 - Initial Release ✅
- [x] Card search functionality
- [x] Bulk search
- [x] Extract and search
- [x] Judge and replace
- [x] Format converter
- [x] Build process
- [x] MCP server
- [x] CLI commands
- **Released**: 2025-11-XX

## Current Milestone

### v1.3.x - Code Quality Improvements (In Progress)
- [x] parseArgs関数のリファクタリング（完了）
  - [x] フェーズ1: オプション処理の統一（setOptionヘルパー作成）
  - [x] フェーズ2: パース処理の分割（単一責務原則の適用）
  - [x] フェーズ3: テストカバレッジの確認（81個成功）
- [x] コード重複の削減（~100行削減達成）
- [x] 保守性の向上（parseArgs: 204行→30行、85%削減）
- [ ] PR #35のマージ待ち

#### Status
- **Progress**: 95%
- **Blockers**: PR #35のレビュー・マージ待ち
- **Completed**: parseArgsリファクタリング（2025-12-07）
- **工数実績**: 約8-10時間
- **成果**: コード品質大幅向上、保守性・可読性の向上

## Future Milestones

### v1.2.0 - Enhanced FAQ Search (Planning)
- [ ] Bulk FAQ search
- [ ] Advanced filtering
- [ ] Performance optimization
- [ ] Additional output formats

### v2.0.0 - Database Updates (Future)
- [ ] Automated data updates
- [ ] English translation support
- [ ] Image integration
- [ ] Web interface

## Long-term Goals
- GitHub Actions CI/CD
- Comprehensive test coverage
- Performance benchmarks
- Plugin system
