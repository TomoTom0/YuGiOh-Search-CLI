# ビルドと開発ガイド

このプロジェクトはTypeScriptで書かれたNode.js CLIアプリケーションです。使用前にビルドが必須です。

## ビルドが必要な理由

1. **ES Modules**: 相対インポートに`.js`拡張子が必須
2. **型安全性**: TypeScriptのコンパイルにより型正確性を確保
3. **パフォーマンス**: コンパイル済みJavaScriptは高速
4. **シンプリシティ**: ビルド後は`node`コマンドのみで実行可能（`tsx`不要）

## クイックスタート

```bash
# 1. 依存関係をインストール
bun install

# 2. ビルド（必須！）
bun run build

# 3. データファイルをダウンロード
bash scripts/setup/setup-data.sh

# 4. CLIコマンドを実行
bun link  # グローバルインストール、または node dist/cli/ygo_search.js を直接実行
ygo_search '{"name":"青眼"}'
```

## ビルドコマンド

### 基本ビルド

```bash
bun run build
```

以下を実行します：
1. `dist/`ディレクトリをクリーン
2. SWCを使用してTypeScriptをJavaScriptにコンパイル
3. `dist/`に`.js`ファイルと型定義を生成

### ビルド出力を確認

```bash
ls -la dist/cli/
# 出力: ygo_search.js, ygo_update_search.js
```

## CLIコマンドの実行

### オプション1: グローバルインストール（推奨）

```bash
# グローバルインストール
bun link

# 任意の場所でコマンド使用可能
ygo_search card --name "青眼" --cols name,cardId
ygo_search extract "{青眼の白龍}"
ygo_search replace "{青眼}を召喚"
ygo_search seek --max 10
ygo_search faq cardId=6808
ygo_search docs list
```

### オプション2: 直接実行

```bash
# グローバルインストール不要
node dist/cli/ygo_search.js card --name "青眼" --cols name,cardId
node dist/cli/ygo_search.js extract "{青眼の白龍}"
node dist/cli/ygo_search.js replace "{青眼}を召喚"
node dist/cli/ygo_search.js seek --max 10
node dist/cli/ygo_search.js faq cardId=6808
node dist/cli/ygo_search.js docs list
```

## 開発ワークフロー

### ウォッチモードでビルド

```bash
# 1つのターミナル: TypeScriptファイルの変更を監視してコンパイル
bun run build --watch
```

TypeScriptファイルの変更は自動的にJavaScriptにコンパイルされます。

### 開発モード（オプション）

高速な開発のため、TypeScriptを直接実行することも可能です：

```bash
# tsx をインストール（未インストールの場合）
bun add -D tsx

# TypeScriptを直接実行
npx tsx src/cli/ygo_search.ts '{"name":"青眼"}'
```

**注意**: 本番環境と配布時は必ずビルド済みのJavaScriptを使用してください。

## トラブルシューティング

### ERR_MODULE_NOT_FOUND

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../pattern-extractor'
```

**原因**: ビルドが実行されていない

**解決策**:
```bash
bun run build
```

### Permission denied

```bash
bash: /usr/local/bin/ygo_search: Permission denied
```

**原因**: 実行権限がない

**解決策**:
```bash
chmod +x dist/cli/*.js
bun link  # 再リンク
```

### `bun link`後にコマンドが見つからない

```bash
command not found: ygo_search
```

**原因**: グローバルbinディレクトリがPATHに含まれていない

**解決策**:
```bash
# bunのグローバルbinパスを確認
bun env | grep BUN_INSTALL

# 必要に応じてPATHに追加
export PATH="$PATH:~/.bun/bin"

# 再リンク
bun link
```

### 完全なリビルド

問題が解決しない場合は完全にリビルドしてください：

```bash
# distディレクトリを削除
rm -rf dist/

# リビルド
bun run build

# CLIコマンドを再リンク
bun unlink ygo-search 2>/dev/null || true
bun link
```

## プロジェクト構造

```
src/
├── cli/                    # CLIコマンドスクリプト
│   ├── ygo_search.ts       # メインCLI（すべてのサブコマンドを含む）
│   └── ygo_update_search.ts
├── lib/                    # コアライブラリ
│   ├── card-search-core.ts
│   ├── normalize.ts
│   └── db.ts
└── utils/                  # ユーティリティ
    └── pattern-extractor.ts

dist/                       # コンパイル済みJavaScript（ビルド後）
├── cli/
│   ├── ygo_search.js       # すべての機能を含む統合CLI
│   └── ygo_update_search.js
├── lib/
├── utils/
└── ...

data/                       # カードデータベースファイル（ダウンロード済み）
├── cards-all.tsv
├── detail-all.tsv
└── faq-all.tsv
```

## テスト

```bash
# 全テスト実行
bun test

# 特定ディレクトリのテスト実行
bun test tests/unit

# カバレッジ付き実行
bun test --coverage
```

## まとめ

| タスク | コマンド |
|--------|---------|
| 依存関係のインストール | `bun install` |
| ビルド | `bun run build` |
| ウォッチモード | `bun run build --watch` |
| CLIをグローバルインストール | `bun link` |
| CLIコマンド実行 | `ygo_search '{"name":"青眼"}'` |
| テスト実行 | `bun test` |
