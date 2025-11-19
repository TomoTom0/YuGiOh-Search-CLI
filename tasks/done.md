# Completed Tasks

## 2025-11-19

### Vector DB Conversion Script ✅
- [x] TSV to JSONL converter for RAG/vector database
- [x] Enum日本語化 (attributes, races, card types)
- [x] Rich text generation in OCG standard format
- [x] FAQ enrichment with related card information
- [x] Metadata generation (releaseGroup, relatedCardIds)
- **Location**: `tmp/wip/`
- **Output**: `tmp/wip/output/cards_for_vectordb.jsonl` (13,754 cards, 22MB)
- **Output**: `tmp/wip/output/faqs_for_vectordb.jsonl` (12,578 FAQs, 32MB)
- **Features**:
  - Handles TSV parsing with relaxed quote/column rules
  - Extracts card IDs from `{{name|id}}` patterns in FAQs
  - Limits enrichment to 5 cards (rest as name list)
  - Error handling for missing card references

## 2025-11-18

### PR #13 Review Fixes ✅
- [x] FOR_LLM_CLIENTS.md - コマンド例を`node dist/`と`ygo_*`に更新
- [x] OUTPUT_FILE_SAVE.md - `ygo_convert`に更新
- [x] SHELL_COMMANDS.md - 個人パスを汎用化
- [x] TYPESCRIPT_FROM_TS.md - 削除（ライブラリAPI未確定）
- [x] USAGE.md - 全体的に`dist/`とグローバルコマンドに更新
- **Commit**: `9e9a551`
- **Files**: 6 files changed, +98/-287

### FAQ Search Feature Implementation ✅
- [x] FAQ types and loader with cardId reverse index
- [x] search_faq tool (by faqId, cardId, cardName, cardFilter, question, answer)
- [x] Extract and embed card info from {{name|id}} patterns
- [x] ygo_faq_search CLI command
- [x] MCP server integration
- [x] Output options (fcol, col, format, random, range, all)
- [x] CLI-friendly key=value parameter style
- **PR**: #14 (OPEN)
- **Commits**: 5 commits
- **Files**: 27 files, +1,688/-4

## Earlier Completions

### PR #9 - Build Process Implementation ✅
- Merged to dev
- Added build step with TypeScript compilation
- Removed tsx dependency for runtime

### Documentation Updates ✅
- Created comprehensive task management system
- Updated multiple documentation files
- Added FAQ search documentation
