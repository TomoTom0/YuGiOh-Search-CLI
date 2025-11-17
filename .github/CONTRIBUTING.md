# Contributing to Yu-Gi-Oh! Card Database MCP Server

Thank you for considering contributing to this project!

## Development Workflow

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit: `git commit -m "Add my feature"`
6. Push: `git push origin feature/my-feature`
7. Create a Pull Request

## Testing

### Before Submitting a PR

```bash
# Run unit tests (required - runs in CI)
npm run test:unit

# Run integration tests (optional - requires TSV data)
npm run test:integration

# Run all tests
npm test
```

### CI Requirements

All pull requests must:
- ✅ Pass unit tests on Node.js 18.x and 20.x
- ✅ Have no TypeScript compilation errors
- ✅ Include tests for new features

## Code Style

- Use TypeScript for new code
- Follow existing code structure
- Add JSDoc comments for public functions
- Keep functions small and focused

## Test Guidelines

### Unit Tests (`tests/unit/`)
- Must work without TSV data files
- Use mock data from `tests/fixtures/mock-data.ts`
- Test pure logic and functions
- Fast execution (<1 second total)

### Integration Tests (`tests/integration/`)
- Can use actual TSV data
- Test CLI scripts end-to-end
- May take longer to execute

## Adding New Features

1. Create implementation in `src/`
2. Add unit tests in `tests/unit/`
3. Add integration tests in `tests/integration/`
4. Update documentation in `docs/`
5. Update README.md if needed

## Questions?

Open an issue for discussion before starting major changes.
