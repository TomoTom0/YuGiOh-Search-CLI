# ビルドと実行ガイド

## 概要

このプロジェクトはTypeScriptで書かれており、実行前に**ビルドが必須**です。

## ビルドが必要な理由

1. **ES Modules**: 相対インポートに`.js`拡張子が必要
2. **型チェック**: TypeScriptの型安全性を維持
3. **パフォーマンス**: コンパイル済みJavaScriptの方が高速
4. **tsx不要**: ビルド後は`node`コマンドだけで実行可能

## クイックスタート

```bash
# 1. 依存関係をインストール
npm install

# 2. ビルド
npm run build

# 3. データファイルをダウンロード
bash scripts/setup/setup-data.sh

# 4. 実行
npm start

# または CLI コマンドをグローバルインストール
npm link
ygo_search '{"name":"青眼"}'
```

## ビルドコマンド

### 基本ビルド

```bash
npm run build
```

これは以下を実行します:
1. `dist/`ディレクトリを削除
2. TypeScript コンパイラ(`tsc`)を実行
3. `dist/`に`.js`ファイルと`.d.ts`ファイルを生成

### ビルドの確認

```bash
# ビルド成果物を確認
ls -la dist/

# 出力例:
# dist/
# ├── ygo-search-card-server.js
# ├── search-cards.js
# ├── extract-and-search-cards.js
# ├── judge-and-replace.js
# ├── format-converter.js
# ├── bulk-search-cards.js
# ├── cli/
# │   ├── ygo_search.js
# │   ├── ygo_extract.js
# │   └── ygo_convert.js
# ├── lib/
# │   ├── db.js
# │   ├── normalize.js
# │   └── search.js
# └── utils/
#     └── pattern-extractor.js
```

## 実行方法

### 1. MCPサーバーとして

```bash
# ビルド後に実行
npm start

# または直接
node dist/ygo-search-card-server.js
```

### 2. CLIコマンドとして

#### グローバルインストール（推奨）

```bash
npm link
```

これで以下のコマンドが使えます:
- `ygo_search`
- `ygo_extract`
- `ygo_convert`

```bash
ygo_search '{"name":"青眼"}' cols=name,cardId
ygo_extract "{青眼の白龍}"
ygo_convert input.json:output.jsonl
```

#### 直接実行

```bash
node dist/search-cards.js '{"name":"青眼"}' cols=name
node dist/extract-and-search-cards.js "{青眼}"
node dist/judge-and-replace.js "{青眼}を召喚"
node dist/format-converter.js input.json:output.yaml
```

### 3. TypeScriptから

```typescript
import { searchCards } from 'ygo-search-card-mcp'

const results = await searchCards({ name: '青眼' })
```

**注意**: TypeScriptから使う場合も事前にビルドが必要です。

## 開発モード

### watchモードでビルド

```bash
# TypeScriptコンパイラをwatchモード起動
npx tsc --watch
```

別のターミナルでMCPサーバーを起動:

```bash
npm start
```

ファイルを編集すると自動で再ビルドされ、サーバーを再起動すると変更が反映されます。

### tsxを使った開発（オプション）

開発中のみ`tsx`で直接実行することも可能です:

```bash
# 開発モードで起動
npm run dev

# または
npx tsx src/ygo-search-card-server.ts
```

**注意**: 本番環境や配布時は必ずビルドしてください。

## tsxが不要になった理由

### 以前（～PR#3）

```bash
# tsxが必要だった
npx tsx src/search-cards.ts '{"name":"青眼"}'
```

### 現在（PR#4以降）

```bash
# ビルド後はnodeだけでOK
npm run build
node dist/search-cards.js '{"name":"青眼"}'
```

### 変更内容

1. **相対インポートに`.js`拡張子を追加**
   ```typescript
   // 修正前
   import { extract } from './utils/pattern-extractor'
   
   // 修正後
   import { extract } from './utils/pattern-extractor.js'
   ```

2. **スクリプト内のパスを`.js`に変更**
   ```typescript
   // 修正前
   const script = path.join(__dirname, 'search-cards.ts')
   spawn('npx', ['tsx', script])
   
   // 修正後
   const script = path.join(__dirname, 'search-cards.js')
   spawn('node', [script])
   ```

3. **shebangを`tsx`から`node`に変更**
   ```typescript
   // 修正前
   #!/usr/bin/env tsx
   
   // 修正後
   #!/usr/bin/env node
   ```

## トラブルシューティング

### ERR_MODULE_NOT_FOUND

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../pattern-extractor'
```

**原因**: ビルドしていない

**解決策**:
```bash
npm run build
```

### Permission denied

```bash
bash: /usr/local/bin/ygo_search: Permission denied
```

**原因**: 実行権限がない

**解決策**:
```bash
chmod +x dist/**/*.js
npm link  # 再リンク
```

### tsx: command not found

```
zsh:1: command not found: tsx
```

**原因**: スクリプト内で`tsx`を参照している（古いバージョン）

**解決策**:
```bash
git pull origin dev
npm run build
npm link
```

### ビルド後もエラーが出る

```bash
# distを完全削除して再ビルド
npm run prebuild
npm run build

# グローバルコマンドを再インストール
npm unlink -g ygo-search-card-mcp
npm link
```

## CI/CD

GitHubActionsでは自動的にビルドとテストが実行されます:

```yaml
# .github/workflows/test.yml
- name: Build
  run: npm run build

- name: Run tests
  run: npm test
```

## まとめ

### ✅ やるべきこと

1. `npm install` - 依存関係をインストール
2. `npm run build` - **必須!** ビルドを実行
3. `bash scripts/setup/setup-data.sh` - データをダウンロード
4. `npm link` - CLIコマンドをインストール（オプション）

### ❌ 不要なこと

- ~~`npx tsx`でスクリプトを実行~~ → `node`でOK
- ~~`tsx`を依存関係に追加~~ → `devDependencies`のみ
- ~~実行時にTypeScriptファイルを参照~~ → ビルド済み`.js`を使用

### 🚀 結果

- **高速**: コンパイル済みJavaScriptで実行
- **軽量**: 本番環境に`tsx`不要
- **安全**: TypeScriptの型チェックを開発時に実施
- **簡単**: `node`コマンドだけで実行可能
