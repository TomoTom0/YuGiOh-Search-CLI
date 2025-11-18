# PR #9 Review Comments

## Critical Issues

### 1. JSONL Parse Error in bulk-search-cards.ts
**Status:** ✅ DONE  
**Priority:** 🔴 Critical  
**File:** `src/bulk-search-cards.ts`

**Problem:**
- `search-cards.js` outputs JSONL format (one JSON object per line)
- `executeQuery` function tries to parse entire stdout as single JSON object
- When multiple results exist, `JSON.parse` fails and returns empty array without error

**Solution Applied:**
```typescript
try {
  if (!stdout.trim()) {
    resolve([]);
    return;
  }
  const lines = stdout.trim().split('\n');
  const result = lines.map(line => JSON.parse(line));
  resolve(result);
} catch (e) {
  resolve([]);
}
```

**Location:** Lines 73-79  
**Fixed in commit:** [Pending]

---

## Medium Priority Issues

### 2. Documentation Inconsistency - ygo_bulk_search
**Status:** ✅ DONE  
**Priority:** 🟡 Medium  
**File:** `docs/SHELL_COMMANDS.md`

**Problem:**
- Documentation states `ygo_bulk_search` is "not yet implemented as CLI"
- Actually implemented in `package.json` bin section and `src/cli/ygo_bulk_search.ts`

**Solution Applied:**
Removed "(not yet implemented as CLI)" from line 20

**Location:** Line 20  
**Fixed in commit:** [Pending]

---

### 3. Duplicate Project Root Finding Logic
**Status:** ✅ DONE  
**Priority:** 🟡 Medium  
**Files:** `src/search-cards.ts`, `src/ygo-seek.ts`

**Problem:**
- Same project root finding logic duplicated across multiple files

**Solution Applied:**
- Created common utility function in `src/utils/project-root.ts`
- Updated both `src/search-cards.ts` and `src/ygo-seek.ts` to import and use the utility

**Location:** Lines 115-130 in `src/ygo-seek.ts`, lines 217-233 in `src/search-cards.ts`  
**Fixed in commit:** [Pending]

---

## Summary

- **Critical Issues:** 1 (✅ DONE)
- **Medium Priority Issues:** 2 (✅ DONE)
- **Total Issues:** 3 (✅ All Fixed)

**Review by:** Gemini Code Assist  
**Review Date:** 2025-11-18  
**Commit:** 81d5736e8b6cbb374c7951573c604ec62c18684b  
**Fixed Date:** 2025-11-18

## Changes Made

1. **Fixed JSONL parsing in bulk-search-cards.ts**: Changed from parsing stdout as single JSON to splitting by lines and parsing each line separately
2. **Updated documentation**: Removed incorrect "not yet implemented" note for ygo_bulk_search
3. **Refactored duplicate code**: Created `src/utils/project-root.ts` utility function and updated both `search-cards.ts` and `ygo-seek.ts` to use it
