# Build and Development Guide

This project is a Node.js CLI application written in TypeScript. It requires building before use.

## Why Build is Required

1. **ES Modules**: Relative imports require `.js` extensions
2. **Type Safety**: TypeScript compilation ensures type correctness
3. **Performance**: Compiled JavaScript is faster than on-the-fly compilation
4. **Simplicity**: After build, only `node` command is needed (no `tsx` required)

## Quick Start

```bash
# 1. Install dependencies
bun install

# 2. Build project (required!)
bun run build

# 3. Download data files
bash scripts/setup/setup-data.sh

# 4. Run CLI commands
bun link  # Install globally, or use node dist/cli/ygo_search.js directly
ygo_search '{"name":"青眼"}'
```

## Build Commands

### Basic Build

```bash
bun run build
```

This:
1. Cleans the `dist/` directory
2. Compiles TypeScript to JavaScript using SWC
3. Generates `.js` files and type definitions in `dist/`

### Verify Build Output

```bash
ls -la dist/cli/
# Output: ygo_search.js, ygo_extract.js, ygo_replace.js, ygo_convert.js, etc.
```

## Running CLI Commands

### Option 1: Global Installation (Recommended)

```bash
# Install globally
bun link

# Then use commands anywhere
ygo_search '{"name":"青眼"}' cols=name,cardId
ygo_extract "{青眼の白龍}"
ygo_replace "{青眼}を召喚"
ygo_seek --max 10
ygo_faq_search cardId=6808
```

### Option 2: Direct Execution

```bash
# No global installation needed
node dist/cli/ygo_search.js '{"name":"青眼"}' cols=name,cardId
node dist/cli/ygo_extract.js "{青眼の白龍}"
node dist/cli/ygo_replace.js "{青眼}を召喚"
node dist/cli/ygo_seek.js --max 10
node dist/cli/ygo_faq_search.js cardId=6808
```

## Development Workflow

### Watch Mode Build

```bash
# In one terminal: watch TypeScript files for changes
bun run build --watch
```

Changes to TypeScript files will automatically recompile to JavaScript.

### Development Mode (Optional)

For rapid development, you can use `tsx` to run TypeScript directly:

```bash
# Install tsx (if not already installed)
bun add -D tsx

# Run TypeScript directly
bun run dev
# or
npx tsx src/cli/ygo_search.ts '{"name":"青眼"}'
```

**Note**: For production and distribution, always use the built JavaScript.

## Troubleshooting

### ERR_MODULE_NOT_FOUND

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../pattern-extractor'
```

**Cause**: Build not executed

**Solution**:
```bash
bun run build
```

### Permission Denied

```bash
bash: /usr/local/bin/ygo_search: Permission denied
```

**Cause**: Executable permissions missing

**Solution**:
```bash
chmod +x dist/cli/*.js
bun link  # Re-link
```

### Command Not Found After `bun link`

```bash
command not found: ygo_search
```

**Cause**: Global bin directory not in PATH

**Solution**:
```bash
# Check bun global bin path
bun env | grep BUN_INSTALL

# Add to PATH if needed
export PATH="$PATH:~/.bun/bin"

# Re-link
bun link
```

### Clean Rebuild

If problems persist, do a full rebuild:

```bash
# Remove dist directory
rm -rf dist/

# Rebuild
bun run build

# Re-link CLI commands
bun unlink ygo-search-card-mcp 2>/dev/null || true
bun link
```

## Project Structure

```
src/
├── cli/                    # CLI command scripts
│   ├── ygo_search.ts
│   ├── ygo_extract.ts
│   ├── ygo_replace.ts
│   ├── ygo_convert.ts
│   ├── ygo_seek.ts
│   ├── ygo_bulk_search.ts
│   └── ygo_faq_search.ts
├── lib/                    # Core libraries
│   ├── card-search-core.ts
│   ├── normalize.ts
│   └── db.ts
├── utils/                  # Utilities
│   └── pattern-extractor.ts
└── ygo-search-card-server.ts  # MCP server (deprecated)

dist/                       # Compiled JavaScript (after build)
├── cli/
│   ├── ygo_search.js
│   ├── ygo_extract.js
│   ├── ...
├── lib/
├── utils/
└── ...

data/                       # Card database files (downloaded)
├── cards-all.tsv
├── detail-all.tsv
└── faq-all.tsv
```

## Testing

```bash
# Run all tests
bun test

# Run tests in specific directory
bun test tests/unit

# Run with coverage
bun test --coverage
```

## Summary

| Task | Command |
|------|---------|
| Install dependencies | `bun install` |
| Build | `bun run build` |
| Watch mode | `bun run build --watch` |
| Install CLI globally | `bun link` |
| Run CLI command | `ygo_search '{"name":"青眼"}'` |
| Run tests | `bun test` |
| Development mode | `bun run dev` |
