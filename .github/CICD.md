# CI/CD Configuration

This project uses GitHub Actions for continuous integration.

## Workflows

### Unit Tests (`.github/workflows/test.yml`)

Runs on every pull request and push to `main` and `mcp_new` branches.

**What it does:**
- Tests on Node.js 18.x and 20.x
- Runs unit tests only (no TSV data required)
- Checks TypeScript compilation
- Uploads test artifacts

**Local testing:**
```bash
# Run unit tests (same as CI)
npm run test:unit

# Run all tests (requires TSV data)
npm test

# Run integration tests (requires TSV data)
npm run test:integration

# Watch mode for development
npm run test:watch
```

## Test Organization

### Unit Tests (`tests/unit/`)
- ✅ Run in CI/CD (no data dependencies)
- Test pure logic: pattern extraction, replacement, mock data
- Fast execution (~100-200ms)

### Integration Tests (`tests/integration/`)
- ❌ Not run in CI/CD (require TSV data files)
- Test actual CLI scripts with real data
- Run locally before committing

## Adding New Tests

### For CI/CD-compatible tests:
1. Add to `tests/unit/`
2. Use mock data from `tests/fixtures/mock-data.ts`
3. No external dependencies (files, databases, etc.)

### For local-only tests:
1. Add to `tests/integration/`
2. Can use actual TSV data and CLI scripts
3. Test end-to-end functionality

## CI/CD Status

[![Unit Tests](https://github.com/YOUR_USERNAME/ygo-db-local-mcp/actions/workflows/test.yml/badge.svg)](https://github.com/YOUR_USERNAME/ygo-db-local-mcp/actions/workflows/test.yml)
