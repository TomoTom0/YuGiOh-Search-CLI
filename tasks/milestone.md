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

## Future Milestones

### v1.4.0 - Code Quality & Refactoring (Planned)
- [ ] parseArgs関数のリファクタリング（優先度: 高）
  - [ ] フェーズ1: オプション処理の統一（setOptionヘルパー作成）
  - [ ] フェーズ2: パース処理の分割（単一責務原則の適用）
  - [ ] フェーズ3: テストカバレッジの向上（90%以上）
- [ ] コード重複の削減（~100行削減目標）
- [ ] 保守性の向上

#### Status
- **Priority**: High（保守性に大きく影響）
- **工数見積**: 6-9時間
- **リスク**: 低（インターフェース変更なし）
- **根拠**: PR #34の指摘#5、詳細は`tmp/pr/34/analysis.md`参照

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
