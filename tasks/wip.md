# Work In Progress

## Currently Working On
🚧 Search enhancements: --max and --sort options

## Status
- Branch: dev
- Last Updated: 2025-11-19
- Current Task: Add --max and --sort to search-cards

## Progress
- [x] Add --max option (default: 100)
  - [x] Implement limit logic
  - [x] Show warning when limit reached (except --raw mode)
- [x] Add --sort option
  - [x] Support fields: cardId, name, ruby, atk, def, levelValue
  - [x] Support sort order: asc/desc
  - [x] Default order: numeric→asc, text→dictionary order
- [x] Update --help text
- [x] Build and test

## Ready for Review
All tasks completed and tested.
