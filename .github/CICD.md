# CI/CD Configuration

This project uses GitHub Actions for continuous integration.

## Workflows

### Unit Tests (`.github/workflows/test.yml`)

Runs on every pull request and push to `main` and `dev` branches.

**Jobs:**
- `unit-tests` (Node.js 20.x / 22.x matrix): installs deps (`pnpm install --frozen-lockfile`), builds with swc, runs unit tests (`pnpm test:unit`), and uploads test results.
- `lint` (Node.js 20.x): installs deps and runs the swc build (TypeScript compile check).

**Local testing:**
```bash
# Run unit tests (same as CI)
pnpm run test:unit

# Run all tests (requires TSV data)
pnpm test

# Run integration tests (requires TSV data)
pnpm run test:integration

# Watch mode for development
pnpm run test:watch
```

### Rust CI (`.github/workflows/rust-ci.yml`)

Runs on every pull request and push to `main` and `dev` branches, plus manual dispatch. Verifies the Rust SDK (`crates/ygo-search`) across its feature matrix.

**Jobs:**
- `native-matrix`: `cargo check` + `cargo test` for each feature combination (`default` / `fs` / `format` / `fs+format` / `vector-search` / `vector`). `vector-search` is checked standalone (independent of `fs`) as well as via the `vector` umbrella. Tests run single-threaded (`--test-threads=1`) to respect SERIAL env guards.
- `wasm32-success`: Confirms the core crate (Layer A) and the `ygo-search-workers` crate compile on `wasm32-unknown-unknown`.
- `wasm32-compile-fail`: Confirms native-only features (`fs` / `format` / `vector-search` / `vector-index`) are rejected on `wasm32`. The failure is strictly validated against an allow-list: it must contain either the feature-specific `compile_error!` message or the known `getrandom` upstream dependency error — unrelated dependency or compiler-regression failures fail the job.

`--all-features` is intentionally not run (the wasm32 exclusion is expected to fail compilation). Uses `Swatinem/rust-cache` and `--locked`.

**Local testing:**
```bash
# native feature matrix (per feature)
cargo test -p ygo-search --features fs -- --test-threads=1

# wasm32 success path
cargo check -p ygo-search-workers --target wasm32-unknown-unknown

# wasm32 compile-fail (expect non-zero exit)
cargo check -p ygo-search --features format --target wasm32-unknown-unknown
```

### PR Validation (`.github/workflows/pr-validation.yml`)

Runs on pull requests targeting `main`. Enforces that the source branch is `dev` (`main` is updated only via PRs from `dev`, per the branch protection policy).

## Test Organization

### Unit Tests (`tests/unit/`)
- Run in CI/CD (no data dependencies)
- Test pure logic: pattern extraction, replacement, mock data
- Fast execution (~100-200ms)

### Integration Tests (`tests/integration/`)
- Not run in CI/CD (require TSV data files)
- Test actual CLI scripts with real data
- Run locally before committing

### Rust SDK Tests (`crates/ygo-search/tests/`)
- Run in Rust CI (`rust-ci.yml`) under each feature flag
- Feature-gated via `#![cfg(feature = "...")]` at the top of each test file
- Tests requiring model files are marked `#[ignore]` (run manually via `YGO_SEARCH_MODEL_DIR`)

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

[![Unit Tests](https://github.com/TomoTom0/YuGiOh-Search-CLI/actions/workflows/test.yml/badge.svg)](https://github.com/TomoTom0/YuGiOh-Search-CLI/actions/workflows/test.yml)
[![Rust CI](https://github.com/TomoTom0/YuGiOh-Search-CLI/actions/workflows/rust-ci.yml/badge.svg)](https://github.com/TomoTom0/YuGiOh-Search-CLI/actions/workflows/rust-ci.yml)
