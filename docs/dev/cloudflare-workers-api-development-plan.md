# Cloudflare Workers API開発計画

## 概要

ygo-search CLIの機能をCloudflare Workers APIで提供するための開発計画。

## 現在の実装状況

### ✅ 実装済み

| エンドポイント | 機能 | CLI対応 |
|--------------|------|---------|
| `/health` | ヘルスチェック | - |
| `/api/cards/search` | カード検索（名前の部分一致のみ） | `card` ⚠️ |
| `/api/faqs/search` | FAQ検索 | `faq` ✅ |
| `/api/cards/by-id` | ID指定検索 | `card --cardId` ✅ |
| `/api/stats` | 統計情報 | - ✅ |
| `/api/cards/semantic-search` | セマンティック検索（カード） | `vector search --type cards` ⚠️ |
| `/api/faqs/semantic-search` | セマンティック検索（FAQ） | `vector search --type faqs` ⚠️ |

### ❌ 未実装

| CLIコマンド | APIエンドポイント | 説明 |
|------------|------------------|------|
| `extract` | `/api/cards/extract` | カード名パターン抽出 |
| `replace` | `/api/cards/replace` | カード名パターン置換 |
| `seek` | `/api/cards/seek` | ランダムカード取得 |
| `bulk` | `/api/cards/bulk` | 複数クエリ一括検索 |
| `convert` | `/api/convert` | フォーマット変換 |
| `vector setup` | `/api/vector/setup` | Vector DBセットアップ |
| `vector setup-generic` | `/api/vector/setup-generic` | 汎用データインポート |
| `docs` | `/api/docs` | APIドキュメント参照 |
| `update` | `/api/update` | データ更新 |

## 実装計画

### Phase 0: 既存検索機能の完全実装（優先）

#### 0.1 検索機能の完全実装
- **エンドポイント**: `GET /api/cards/search` （拡張）
- **リクエスト**: 既存の`q`パラメータに加え、以下のパラメータをサポート
- **実装内容**:
  - 属性検索（`attribute`）
  - 種族検索（`race`）
  - カード種別（`cardType`）
  - レベル検索（`level`）
  - 攻撃力・守備力検索（`atk`, `def`）
  - モンスタータイプ（`monsterTypes`）
  - 魔法タイプ（`spellEffectType`）
  - 罠タイプ（`trapEffectType`）
  - リンクマーカー（`linkMarkers`）
  - リンク値（`linkValue`）
  - テキスト検索（`text`）
  - マイナス検索
  - フレーズ検索
  - 正規表現検索
  - 複数条件（AND/OR）
  - ソート機能（`sort`）
- **優先度**: 最高
- **依存タスク**: TASK-78

#### 参照
- CLI: ygo-search card の全てのオプション
- ライブラリ: searchCards

---

### Phase 1: 基本的な検索機能拡張

#### 1.1 extract エンドポイント
- **エンドポイント**: `POST /api/cards/extract`
- **リクエスト**: `{text: "...", cols: [...]}`
- **レスポンス**: `{cards: [{pattern, type, query, results}]}`
- **機能**: `extractCardPatterns` + `extractAndSearchCards`
- **優先度**: 高

#### 1.2 replace エンドポイント
- **エンドポイント**: `POST /api/cards/replace`
- **リクエスト**: `{text: "...", options: {mountPar: bool}}`
- **レスポンス**: `{processedText, hasUnprocessed, warnings, processedPatterns}`
- **機能**: `judgeAndReplace`
- **優先度**: 高

#### 1.3 seek エンドポイント
- **エンドポイント**: `GET /api/cards/seek`
- **リクエスト**: `?max=N&range=X-Y&all`
- **レスポンス**: `{data: [...], total, range}`
- **機能**: `seekCards`
- **優先度**: 中

#### 1.4 bulk エンドポイント
- **エンドポイント**: `POST /api/cards/bulk`
- **リクエスト**: `[{filter: {...}}, {filter: {...}}]`
- **レスポンス**: `[...]` （JSONL形式）
- **機能**: 複数検索クエリの並列実行
- **優先度**: 中

### Phase 2: Vector DB 関連機能

#### 2.1 vector setup エンドポイント（管理者のみ）
- **エンドポイント**: `POST /api/vector/setup`
- **リクエスト**: `{type: "cards|faqs|all", keepTmp: bool}`
- **レスポンス**: `{message, cardsCount, faqsCount}`
- **機能**: `convertCardsToJsonl`, `convertFaqsToJsonl`, `indexFromJsonl`
- **認証**: 必要（CronまたはSecretベース）
- **優先度**: 低

#### 2.2 vector setup-generic エンドポイント（管理者のみ）
- **エンドポイント**: `POST /api/vector/setup-generic`
- **リクエスト**: `{files: [...], table: "name", options: {...}}`
- **レスポンス**: `{message, count}`
- **機能**: `convertGenericToJsonl`, `indexFromJsonl`
- **認証**: 必要
- **優先度**: 低

### Phase 3: ユーティリティ機能

#### 3.1 convert エンドポイント
- **エンドポイント**: `POST /api/convert`
- **リクエスト**: `{input: "...", outputFormat: "jsonl|json|yaml"}`
- **レスポンス**: `{converted, inputFormat, outputFormat}`
- **機能**: `convertFormatFile`, `formatOutput`
- **優先度**: 低

#### 3.2 docs エンドポイント
- **エンドポイント**: `GET /api/docs`
- **リクエスト**: `?name=searchCards` または `?list`
- **レスポンス**: ドキュメントまたは一覧
- **機能**: `showDoc`, `listDocs`
- **優先度**: 低

#### 3.3 update エンドポイント（管理者のみ）
- **エンドポイント**: `POST /api/update`
- **リクエスト**: `{}` （Cronから実行）
- **レスポンス**: `{updated, cards, faqs, timestamp}`
- **機能**: データの更新
- **認証**: 必要（Cronのみ）
- **優先度**: 低

## 技術的検討事項

### 認証・認可
- 管理者機能（`vector setup`, `vector setup-generic`, `update`）は認証が必要
- Cloudflare Workersの認証方法:
  - Secretキーベース
  - CORS + API Key
  - JWT（過度）

### レート制限
- **削除済み**: 以前のKVベースのレート制限は削除
- Cloudflareの標準DDoS保護・ボット検出を使用
- 必要に応じて将来的にAPI認証（APIキー、JWT）で制御可能
- `bulk` コマンド: 最大50クエリ制限は維持
- `convert` コマンド: タイムアウトの考慮が必要

### キャッシュ戦略
- **削除済み**: 以前のKVベースのキャッシュは削除
- 理由: KV無料枠の書き込み制限（1,000回/日）が厳しすぎる
- D1データベースが十分高速（無料枠: 5百万読み取り/日）
- 動的な検索結果のキャッシュはパラメータ組み合わせが無限になり非効率

### エラーハンドリング
- 既存: 統一的なエラーレスポンス
- 新エンドポイントも同じ形式に統一
- バリデーションエラー: 400
- 認証エラー: 401
- レート制限: 429
- 内部エラー: 500

## 実装スケジュール

### Sprint 1: 基本的な検索機能拡張（1週間）
- Day 1-2: extract エンドポイント実装
- Day 3-4: replace エンドポイント実装
- Day 5: seek エンドポイント実装
- Day 6-7: bulk エンドポイント実装 + テスト

### Sprint 2: Vector DB関連機能（1週間）
- Day 1-2: 認証機構の実装
- Day 3-4: vector setup エンドポイント実装
- Day 5-6: vector setup-generic エンドポイント実装
- Day 7: テスト + ドキュメント

### Sprint 3: ユーティリティ機能（1週間）
- Day 1-2: convert エンドポイント実装
- Day 3-4: docs エンドポイント実装
- Day 5-6: update エンドポイント実装
- Day 7: 統合テスト + ドキュメント

## テスト計画

### ユニットテスト
- 各エンドポイントのハンドラ関数のテスト
- モックを使用したD1/Vectorize/R2/AIバインディングのテスト

### 統合テスト
- wrangler dev でのローカルテスト
- Cloudflare Workers上のテスト

### 負荷テスト
- `bulk` エンドポイントの負荷テスト
- レート制限の確認

## ドキュメント

### APIドキュメント
- OpenAPI/Swagger形式のAPIドキュメント
- 各エンドポイントの例

### ユーザードキュメント
- APIの使用方法
- クイックスタート

### 開発者ドキュメント
- 認証・認可の設定方法
- デプロイ手順

## 関連タスク

- [TASK-78](../../.claude/tasks/task-78.md) - 検索機能の完全実装（優先）
- [TASK-68](../../.claude/tasks/task-68.md) - extractエンドポイントの実装
- [TASK-69](../../.claude/tasks/task-69.md) - replaceエンドポイントの実装
- [TASK-70](../../.claude/tasks/task-70.md) - seekエンドポイントの実装
- [TASK-71](../../.claude/tasks/task-71.md) - bulkエンドポイントの実装
- [TASK-72](../../.claude/tasks/task-72.md) - convertエンドポイントの実装
- [TASK-73](../../.claude/tasks/task-73.md) - docsエンドポイントの実装
- [TASK-74](../../.claude/tasks/task-74.md) - vector setupエンドポイントの実装
- [TASK-75](../../.claude/tasks/task-75.md) - vector setup-genericエンドポイントの実装
- [TASK-76](../../.claude/tasks/task-76.md) - updateエンドポイントの実装

## 更新履歴

- 2026-01-22: 初版作成
- 2026-01-22: Phase 0（検索機能の完全実装）を追加、TASK-64・77完了を反映
