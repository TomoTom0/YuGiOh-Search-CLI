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
│   ├── ygo-seek.test.ts
│   └── ygo-search-help.test.ts  # CLI --help/-h の位置非依存動作（commander移行の回帰防止）
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

crates/ygo-search/             # Rust SDK テスト（cargo test、feature gate で対象切替）
├── src/                       # モジュール内 unit test（#[cfg(test)] mod tests）
└── tests/                     # 統合テスト
    ├── contract.rs            # 型契約・シリアライズ（default）
    ├── search.rs              # カード検索（feature: fs）
    ├── seek.rs                # ランダム抽出 seek（feature: fs）
    ├── pipeline.rs            # 検索パイプライン（feature: fs）
    ├── fs.rs                  # TSV 読込（feature: fs）
    ├── format.rs              # フォーマット変換（feature: format）
    ├── jsonl.rs               # JSONL 読込（feature: fs）
    ├── vector.rs              # LanceDB 接続・検索（feature: vector-search・model 不要）
    ├── vector_indexer.rs      # index 構築（feature: vector-index・model 不要 + #[ignore] E2E）
    ├── vector_embeddings.rs   # embedding golden 一致性 + 整合性ドリフト検出（#[ignore]・model 必須）
    └── vector_model_integrity.rs  # revision/hash pinning 検証（feature: vector-search・model 不要）
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

### Rust SDK テスト（`crates/ygo-search/`）

**対象**: Rust SDK（`crates/ygo-search`）の機能テスト。TS SDK と機能パリティを保つ移植層の検証。
feature gate（`default` / `fs` / `format` / `vector-search` / `vector-index`）でコンパイル・実行対象が変わる。

**主なテストファイル**（`crates/ygo-search/tests/`）:
- `contract.rs`・`search.rs`・`seek.rs`・`pipeline.rs`・`fs.rs`・`format.rs`・`jsonl.rs`
  — 型契約・検索・TSV/JSONL 読込・フォーマット変換（feature: `fs`/`format`/`default`）
- `vector.rs` — LanceDB 接続・検索（feature: `vector-search`・model 不要）
- `vector_indexer.rs` — index 構築（feature: `vector-index`・model 不要 `parse_jsonl`/`build_record_batch` + `#[ignore]` E2E）
- `vector_embeddings.rs` — embedding golden 一致性 + モデル整合性ドリフト検出（`#[ignore]`・model 必須）
- `vector_model_integrity.rs` — revision/hash pinning のオーケストレーション（feature: `vector-search`・model 不要）

**実行コマンド**:
```bash
cargo test -p ygo-search --features vector-search     # vector 系（model 不要は常時実行）
cargo test -p ygo-search --features vector-index      # fs + vector-search
cargo test -p ygo-search                              # default feature（純粋ロジックのみ）
cargo test -p ygo-search --features vector-search --test vector_model_integrity  # 整合性テスト単体
cargo clippy -p ygo-search --features vector-search --all-targets -- -D warnings  # lint
```

**model 必須テスト（`#[ignore]`）**:
`onnx/model_quantized.onnx`（~118MB・未同梱）を要するテストは `#[ignore]`。
```bash
ROOT=$(pwd)
YGO_SEARCH_MODEL_DIR="$ROOT/tmp/dev/poc/vector-poc/models/Xenova/multilingual-e5-small" \
  cargo test -p ygo-search --features vector-search --test vector_embeddings -- --ignored --nocapture
# 非量子化 model.onnx ↔ golden-nq.json 検証時は以下を追加:
#   YGO_SEARCH_MODEL_FILE=onnx/model.onnx VECTOR_GOLDEN_PATH="$ROOT/tmp/dev/poc/vector-poc/golden-nq.json"
```

> **注意**: `cargo test` は CWD = crate ルート（`crates/ygo-search`）で動作するため、
> 相対パスの環境変数は絶対パス（`$(pwd)/...`）で指定すること。

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
| `crates/ygo-search/src/` の関数・モジュール追加・変更 | 対応する `crates/ygo-search/tests/*.rs` またはモジュール内 unit test（該当 feature 指定で実行） | **必須** |
| モデルファイル（`onnx/*.onnx`・`tokenizer.json`）の差し替え | `models.sha256` 再生成（`scripts/setup/gen-model-manifest.sh`）+ `vector_embeddings.rs` のドリフトテスト実行 | **必須** |

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

### Rust SDK テスト（cargo）
Rust SDK のテストは `cargo test` で実行（feature gate・model 必須テストの実行方法は
上記「Rust SDK テスト」セクション参照）。
```bash
cargo test -p ygo-search --features vector-search   # model 不要テストは常時実行
cargo test --workspace                               # workers crate 含む全体
```

CI（`rust-ci.yml`）では default/fs/format/fs+format/vector-search/vector 各 feature の check+test と、wasm32 での native-only feature 排他検証（compile_error! メッセージまたは既知の getrandom 依存エラーの許可リストで厳格検証）をマトリクス実行。詳細は `.github/CICD.md` 参照。

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
