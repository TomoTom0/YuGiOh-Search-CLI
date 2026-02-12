# テスト構成

このドキュメントは、プロジェクトのテスト構成、更新方針、および保守のための指針を提供します。

## ディレクトリ構成

```
tests/
├── unit/                      # ユニットテスト（単一関数・モジュール）
│   ├── cli-docs.test.ts       # CLIドキュメント生成
│   ├── mock-data.test.ts      # モックデータ生成
│   ├── pattern-extraction.test.ts  # カードパターン抽出
│   ├── replacement-logic.test.ts   # カード名置換ロジック
│   └── text-search.test.ts    # テキスト検索機能
├── integration/               # 統合テスト（複数モジュールの連携）
│   ├── bulk-search-cards.test.ts
│   ├── exported-functions.test.ts
│   ├── extract-and-search-cards.test.ts
│   ├── judge-and-replace.test.ts
│   ├── search-cards.test.ts
│   └── ygo-seek.test.ts
├── e2e/                       # E2Eテスト（本番環境テスト）
│   └── api-endpoints.test.ts  # 本番APIエンドポイント
├── fixtures/                  # テスト用フィクスチャ
│   └── mock-data.ts
└── README.md                  # このファイル

src/
├── __tests__/                 # ソースコード内のテスト
│   ├── worker-api.test.ts     # Worker APIのリクエスト検証
│   └── worker.test.ts         # 検索パーサー機能
└── lib/shared/__tests__/      # 共有ライブラリのテスト
    ├── normalizer.test.ts     # テキスト正規化
    └── search-parser.test.ts  # 検索クエリパーサー
```

## テストカテゴリの役割

### ユニットテスト（`tests/unit/`）

**対象**: 単一の関数やモジュールの振る舞い

**例**:
- ユーティリティ関数（正規化、パース、変換など）
- ビジネスロジック（検索、フィルタリング、集計など）
- データ処理関数

**実行コマンド**: `npm run test:unit`

### 統合テスト（`tests/integration/`）

**対象**: 複数のモジュールを組み合わせた機能

**例**:
- CLIコマンド全体の動作
- データベース操作を含む処理フロー
- 外部モジュール（LanceDB、Rustライブラリ）との連携

**実行コマンド**: `npm run test:integration`

### E2Eテスト（`tests/e2e/`）

**対象**: 本番環境またはステージング環境への実際のリクエスト

**特徴**:
- デフォルトでスキップ（`RUN_E2E_TESTS`環境変数が必要）
- デプロイ後の動作確認に使用
- API認証、実際のデータベース、外部サービスを使用

**実行コマンド**: `RUN_E2E_TESTS=1 PROD_URL=https://api.example.com npm test`

### ソースコード内テスト（`src/__tests__/`, `src/*/__tests__/`）

**対象**: ソースコードと密接に関連するテスト

**例**:
- `src/__tests__/`: Workerのリクエスト検証、検索パーサー
- `src/lib/shared/__tests__/`: 共有ライブラリ（正規化、検索パーサー）

## テスト更新が必要なタイミング

| 変更内容 | 必要なテスト更新 | 優先度 |
|---------|-----------------|--------|
| `src/lib/shared/` の関数追加・変更 | `src/lib/shared/__tests__/` のユニットテスト | **必須** |
| `src/lib/worker/handlers/` の新規ハンドラ | `tests/unit/` にハンドラのユニットテスト | **必須** |
| `src/lib/worker/` のユーティリティ追加 | `tests/unit/` にユニットテスト | **必須** |
| CLIコマンドの追加・変更 | `tests/integration/` に統合テスト | **必須** |
| APIエンドポイントの追加 | `tests/e2e/api-endpoints.test.ts` にE2Eテスト | 推奨 |
| データベーススキーマ変更 | 関連する統合テストの更新 | **必須** |
| エラーハンドリングの変更 | エッジケースのテスト追加 | 推奨 |
| パフォーマンス最適化 | ベンチマークまたは負荷テスト追加 | 任意 |
| バグ修正 | 回帰テスト追加 | **必須** |
| リファクタリング | 既存テストが全てパスすることを確認 | **必須** |

## テストファイルの命名規則

- **ユニットテスト**: `<機能名>.test.ts`
  - 例: `normalizer.test.ts`, `pattern-extraction.test.ts`

- **統合テスト**: `<機能全体>.test.ts`
  - 例: `search-cards.test.ts`, `extract-and-search-cards.test.ts`

- **E2Eテスト**: `<テスト対象>.test.ts`
  - 例: `api-endpoints.test.ts`

- **ソースコード内テスト**: `<対応するモジュール名>.test.ts`
  - 例: `src/lib/shared/normalizer.ts` → `src/lib/shared/__tests__/normalizer.test.ts`

## 重要なテスト対象（必須）

以下の機能には必ずテストを書く必要があります：

### 1. データ変換・正規化
- `src/lib/shared/normalizer.ts` - テキスト正規化
- `src/lib/shared/search-parser.ts` - 検索クエリパーサー

### 2. Worker APIハンドラ
- `src/lib/worker/handlers/*.ts` - 各APIエンドポイントハンドラ
  - 特に新規作成されたハンドラは必ずユニットテストを追加

### 3. バリデーション
- `src/lib/worker/validation.ts` - リクエストパラメータ検証
- `src/lib/worker/filters.ts` - フィルタパラメータ解析

### 4. データベース操作
- `src/lib/worker/database.ts` - データベースクエリ
- データベースを使用する統合テスト

### 5. ビジネスロジック
- カード検索ロジック
- カードパターン抽出・置換ロジック
- FAQ検索ロジック

## テスト実行

### すべてのテストを実行
```bash
npm test
```

### カテゴリ別に実行
```bash
npm run test:unit        # ユニットテストのみ
npm run test:integration # 統合テストのみ
```

### E2Eテストを実行（本番環境確認）
```bash
RUN_E2E_TESTS=1 PROD_URL=https://ygo-search.api.scioj.com npm test
```

### 特定のテストファイルのみ実行
```bash
npx vitest run tests/unit/pattern-extraction.test.ts
```

### ウォッチモード（開発中）
```bash
npm run test:watch
```

### カバレッジ計測
```bash
npm run test:coverage
```

## テスト作成のガイドライン

### 1. 既存のテストを参考にする

新しいテストを書く際は、同じカテゴリの既存テストを参考にしてください。

```typescript
// tests/unit/example.test.ts
import { describe, it, expect } from 'vitest'
import { myFunction } from '../../src/lib/myModule.js'

describe('myFunction', () => {
  it('should do something', () => {
    const result = myFunction(input)
    expect(result).toBe(expected)
  })

  it('should handle edge case', () => {
    const result = myFunction(edgeInput)
    expect(result).toBe(edgeExpected)
  })
})
```

### 2. テストケースの網羅性

最低限、以下のケースをテストする：
- **正常系**: 期待される入力での正常動作
- **異常系**: 無効な入力やエラー条件
- **境界値**: 最小値、最大値、空文字列、nullなど
- **エッジケース**: 特殊なケースや想定外の入力

### 3. テストの独立性

- 各テストは独立して実行可能であること
- テスト間で状態を共有しない
- モックやフィクスチャを適切に使用

### 4. テストの可読性

- describeブロックで機能をグループ化
- itブロックで具体的なテストケースを記述
- テスト名は「何をテストしているか」を明確に

## テスト更新漏れチェック

`check-test-updates`スキルを使用して、コード変更後のテスト更新漏れをチェックできます：

```bash
# Claude Codeで実行
/check-test-updates
```

このスキルは：
1. 最近の変更を分析
2. このREADME.mdの指針に基づいて更新が必要なテストを特定
3. テスト実行結果を確認
4. レポートを生成

## よくある質問

### Q: E2Eテストがスキップされるのはなぜ？
A: E2Eテストは本番環境に対する実際のリクエストを行うため、デフォルトではスキップされます。デプロイ後に手動で実行してください。

### Q: ユニットテストと統合テストの境界は？
A: 単一のモジュール/関数をテストするならユニット、複数のモジュールやCLIコマンド全体をテストするなら統合です。

### Q: モックデータはどこに置く？
A: `tests/fixtures/`ディレクトリに配置してください。

### Q: テストが失敗したらどうする？
A:
1. エラーメッセージを確認
2. テストケースが正しいか検証
3. 実装コードを確認
4. 必要に応じてテストまたは実装を修正

## 関連ドキュメント

- [Vitest Documentation](https://vitest.dev/)
- [プロジェクトルートのCLAUDE.md](../CLAUDE.md) - プロジェクト全体のルール
