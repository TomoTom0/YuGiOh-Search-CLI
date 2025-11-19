# PR #13 Review Fixes - Documentation Updates

## Overview
Gemini Code Assistからのレビュー指摘に対応。古い`npx tsx`コマンドや個人的なパスをビルド後の正しい方法に修正する。

## Tasks

### 1. FOR_LLM_CLIENTS.md - コマンド例の更新
- [x] Line 14-15: `npx tsx src/...` → `node dist/...`に修正
- [x] Line 49-51: MCPサーバー経由とCLIコマンドに分離
- [x] Line 54: `ygo_search`コマンドに変更
- **Priority**: Medium
- **File**: `docs/FOR_LLM_CLIENTS.md`

### 2. OUTPUT_FILE_SAVE.md - format-converter例の更新
- [x] Line 216: `npx tsx src/format-converter.ts` → `ygo_convert`コマンドに修正
- **Priority**: Medium
- **File**: `docs/OUTPUT_FILE_SAVE.md`

### 3. SHELL_COMMANDS.md - 個人パスの削除/汎用化
- [x] Line 6: `/home/tomo/...` → `/path/to/ygo-db-local-mcp`に汎用化
- [x] Line 31: nvm固有パス → `npm config get prefix`を使う汎用的な方法に変更
- **Priority**: Medium
- **File**: `docs/SHELL_COMMANDS.md`

### 4. TYPESCRIPT_FROM_TS.md - 誤ったimport例の修正
- [x] **削除決定**: ライブラリAPIが未確定のため、誤ったドキュメントを削除
- **Priority**: Medium
- **File**: `docs/TYPESCRIPT_FROM_TS.md`
- **Action**: `git rm` で削除済み

### 5. USAGE.md - パスとコマンドの全面更新
- [x] Line 23, 52, 61: `src/` → `dist/`に修正
- [x] Line 74: MCPサーバー起動を`node dist/`と`npm start`の両方記載
- [x] Line 83-92: `npx tsx scripts/mcp/` → `ygo_search`コマンドに変更
- [x] Line 264: `npx tsx` → `ygo_extract`に変更
- [x] Line 330: `npx tsx` → `ygo_replace`に変更
- **Priority**: Medium
- **File**: `docs/USAGE.md`

## Implementation Strategy

### Step 1: 簡単な修正（Tasks 1, 2, 5）
- コマンド例の文字列置換
- `npx tsx src/` → `ygo_*`コマンド
- `src/` → `dist/`

### Step 2: 個人パスの処理（Task 3）
- SHELL_COMMANDS.mdの性質を確認
- 汎用化または削除を決定

### Step 3: TypeScript利用ドキュメント（Task 4）
- ライブラリAPIサポートの方針確認
- ドキュメント修正 or 削除

## Verification
- [x] 全ドキュメントでビルド後のファイルパス使用
- [x] コマンド例が実際に動作する（グローバルコマンド優先）
- [x] 個人環境依存の記述がない
- [x] 一貫性のあるドキュメント

## Summary
全5タスク完了：
1. ✅ FOR_LLM_CLIENTS.md - `node dist/`と`ygo_*`コマンドに更新
2. ✅ OUTPUT_FILE_SAVE.md - `ygo_convert`に更新
3. ✅ SHELL_COMMANDS.md - 個人パスを汎用化
4. ✅ TYPESCRIPT_FROM_TS.md - 削除（ライブラリAPI未確定）
5. ✅ USAGE.md - 全体的に`dist/`とグローバルコマンドに更新

## Notes
- ビルドプロセス導入により`npm run build`が必須
- 実行は`node dist/...`またはグローバルコマンド（`ygo_*`）
- `tsx`への依存は開発時のみ
