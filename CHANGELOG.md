# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v1.3.0] - 2025-12-18

### Added
- **FAQ Search Functionality**: New `search_faq` tool for searching Official FAQ database
  - Search by FAQ ID, card ID, card name patterns
  - Filter by card specifications (race, level, type, etc.)
  - Search question/answer text with wildcards
  - Returns FAQs with embedded card information
  - Fast lookup with reverse index and card search integration
  - New data file: `faq-all.tsv` (12,578 FAQs)
- **ygo_seek Command**: Get random or range-specific card information
  - Random selection with configurable count
  - CardId range filtering
  - Multiple output formats (JSON, CSV, TSV, JSONL)
  - Flexible column selection
  - `--col-all` option to retrieve all columns
- **ygo_replace Command**: Extract, search, and intelligently replace patterns with card IDs or card names
  - Supports `{flexible}`, `《exact》`, `{{name|id}}` patterns
  - `--mount-par` option for replacing with 《card-name》 format
- **ygo_extract Command**: Extract card name patterns from text
  - Identifies `{flexible}`, `《exact》`, `{{name|id}}` patterns
- **ygo_convert Command**: Convert file formats between JSON, CSV, TSV, and JSONL
- **ygo_bulk_search Command**: Efficient bulk search (up to 50 queries)
- **ygo_faq_search Command**: CLI command for FAQ search with key=value style arguments
- **CardId Pattern Validation**: Automatic validation and correction of card names in `{{cardId|name}}` patterns
- **--max and --sort Options**: Enhanced search capabilities for card selection
- **File Output Save Feature**: Support for saving search results to files in various formats
- **Shell Commands**: Global shell commands with `ygo_` prefix for CLI usage

### Changed
- **Package Manager Migration**: Moved from npm to bun for faster builds and package management
- **Build System**: Updated to use SWC for faster TypeScript compilation
- **CLI Architecture**: Reorganized CLI commands into dedicated modules under `dist/cli/`
- **Data File Structure**: Expanded database to include FAQ information alongside card data

### Fixed
- **CLI Help Options**: Removed non-functional `outputPath` and `outputDir` options from help text
- **Module Import Paths**: Fixed ES module import paths for Node.js compatibility
- **HTTP Status Code Detection**: Improved error handling in setup script
- **Error Handling**: Enhanced error messages and validation feedback across all tools
- **Pattern Deduplication**: Optimized deduplication of processed patterns in output

### Technical Improvements
- **TypeScript Migration**: Converted MCP server to TypeScript for better type safety
- **Schema Validation**: Added comprehensive JSON Schema documentation for all tools
- **Test Coverage**: Expanded test suite to cover new features (95 tests passing)
- **CI/CD Pipeline**: Improved GitHub Actions workflow for automated testing
- **Documentation**: Enhanced documentation with detailed usage examples

### Database Updates
- **cards-all.tsv**: 13,754 cards (8.6MB)
- **detail-all.tsv**: Detailed card information (13MB)
- **faq-all.tsv**: 12,578 Official FAQs (16MB) - NEW

## [v1.0.0] - 2025-11-17

### Added
- **Initial Release**
- **search_cards**: Single card search with flexible filters
- **bulk_search_cards**: Efficient bulk search (up to 50 queries)
- **extract_and_search_cards**: Extract card patterns from text and search automatically
- **judge_and_replace_cards**: Extract, search, and intelligently replace patterns with card IDs
- **Card Name Patterns**:
  - `{card-name}`: Flexible search with wildcards (*)
  - `《card-name》`: Exact search with normalization
  - `{{card-name|cardId}}`: Search by card ID
- **Smart Normalization**: Automatic handling of whitespace, symbols, full-width/half-width, hiragana/katakana, and kanji variants
- **Database**: 13,754 Yu-Gi-Oh! cards with full Japanese text and supplementary information

### Data Files
- **cards-all.tsv** (8.2MB): Card basic information
- **detail-all.tsv** (13MB): Detailed card information
