# 次期バージョン（未リリース）

## New Features

（変更内容をここに記載）

## Bug Fixes

（変更内容をここに記載）

## Changes

（変更内容をここに記載）

## Performance

（変更内容をここに記載）

## Refactoring

（変更内容をここに記載）

## Repository Management

（変更内容をここに記載）

## Internal Improvements

- Workers デプロイツールチェーン現代化（TASK-24）: Rust Workers crate の worker 依存を 0.4.2 -> 0.8.7 へ、wrangler.toml の worker-build ピンを ^0.1 -> ^0.8.7 へ更新し legacy `[build.upload]` を除去。`wrangler deploy --dry-run`（wasm-bindgen binding 生成ステップ含む）が通る状態に復旧

## Known Issues

（変更内容をここに記載）
