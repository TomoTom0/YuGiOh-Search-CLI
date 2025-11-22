# Merge Conflict Resolution - 2025-11-19

## Problem Summary

PR #18 (dev → main) had 20 merge conflicts that persisted despite multiple attempts to resolve them.

## Root Cause

**The core issue**: GitHub's PR merge was using **Squash merge** instead of **Create a merge commit**.

### Why This Caused Conflicts

1. **Original situation**:
   - main had commit `5b5cf81` (PR #9 merge commit)
   - dev had newer features but didn't have `5b5cf81` in its history

2. **Failed attempts** (PR #17, #20, #22, #24, #25, #27, #28):
   - Created PRs to merge main into dev
   - GitHub used **squash merge**, which creates a new commit instead of preserving merge history
   - Result: `5b5cf81` never entered dev's history
   - Conflicts persisted because git saw divergent histories

3. **Underlying cause**:
   - Direct push to main created the divergence
   - Normal workflow: feature → dev → main (one direction only)
   - Direct main push broke this flow

## Solution

**PR #29**: Used **"Create a merge commit"** option when merging

- This preserved the merge history
- Brought `5b5cf81` into dev's commit history
- Allowed dev → main to merge cleanly

## Key Lessons

### 1. Merge Method Matters
- **Squash merge**: Creates single commit, loses history
- **Rebase merge**: Rewrites history, loses merge commits  
- **Create a merge commit**: Preserves full history ✅ (Required for branch synchronization)

### 2. Workflow Rules
- Never push directly to main
- All changes must flow: feature → dev → main
- Direct main commits cause divergent histories

### 3. When Resolving Conflicts
- Use `git merge --no-commit` locally to test
- For branch synchronization: use "Create a merge commit"
- File changes = 0 is OK if the merge commit itself is what's needed

## Repository Settings Updated

Disabled squash merge to prevent future issues:
```
allow_squash_merge: false (recommended for this workflow)
allow_merge_commit: true ✅
allow_rebase_merge: false (optional)
```

## Timeline

- 2025-11-19 08:00-15:00: Multiple failed attempts with squash merge
- 2025-11-19 15:16: PR #29 merged with "Create a merge commit" ✅
- Result: dev → main now merges cleanly

## Related PRs

- PR #18: Original dev → main (had conflicts)
- PR #17, #20, #22, #24, #25, #27, #28: Failed merge attempts (squash)
- PR #29: Successful merge (merge commit) ✅
- PR #30: Deleted (premature PR creation)
