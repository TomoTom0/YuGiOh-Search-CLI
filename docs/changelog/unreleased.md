# 次期バージョン（未リリース）

## New Features

- **APIキー管理システムの実装**
  - ユーザーごとのAPIキー発行・管理機能
  - APIキー管理エンドポイント（4個）
    - `POST /api/keys` - APIキー発行（管理者のみ）
    - `GET /api/keys` - APIキー一覧取得
    - `DELETE /api/keys/:id` - APIキー無効化
    - `GET /api/keys/logs` - API使用ログ取得
  - D1データベーステーブル追加
    - `api_keys` - APIキー情報（ユーザーID、スコープ、レート制限、有効期限）
    - `api_logs` - 監査ログ（エンドポイント、メソッド、ステータス、IPアドレス等）
  - 認証ミドルウェア拡張
    - マスターキー OR ユーザーAPIキーの両対応
    - 有効期限チェック
    - スコープ情報取得
  - 監査ログ機能
    - 全APIリクエストを自動記録
    - ユーザーAPIキー使用時のみログ記録
- Cloudflare Workers API実装
  - カード検索エンドポイント (`/api/cards/search`)
  - FAQ検索エンドポイント (`/api/faqs/search`)
  - セマンティック検索エンドポイント（カード・FAQ）
  - 統計情報エンドポイント (`/api/stats`)
  - レート制限機能（60リクエスト/分）
  - キャッシュ機能（1時間TTL）
- カード検索機能の実装（Phase 0完了）
  - 種族検索（race）
  - カード種別検索（cardType）
  - レベル検索（level）
  - 攻撃力・守備力検索（atk/def）
  - テキスト検索（description）
  - モンスタータイプ検索（monsterTypes）
  - 魔法・罠タイプ検索（spellEffectType/trapEffectType）
  - リンクマーカー検索（linkMarkers）
  - ソート機能（ORDER BY）

## Bug Fixes

- `src/worker.ts`の`searchCardsExtended`関数で同じ条件が3回重複していたバグを修正
- `rust/scripts/import-cards.ts`でlevelValueとsupplementInfoの読み込み修正
- **Worker API レスポンスフォーマット修正**
  - データベースのスネークケース（`card_id`, `description`等）からキャメルケース（`cardId`, `text`等）への変換を実装
  - 全APIエンドポイントで`mapCardDbToApi`関数を使用してレスポンスを正規化
  - TypeScript型定義との整合性を確保
- **データ保存場所の cwd フォールバックを廃止**
  - `getWorkDir()`が`~/.local/ygo-search/`未存在時にカレントディレクトリへフォールバックしていたが、`initWorkDir()`が未呼び出しで同ディレクトリが自動作成されず、`update`実行のたび実行場所に`data/`が作られるバグだった
  - フォールバックを削除し、データは常に`~/.local/ygo-search/`に固定（`YGO_SEARCH_WORKDIR`で上書き可）
  - `update`実行時に`initWorkDir()`を呼び`~/.local/ygo-search/`（`data/tsv`, `data/vector`, `tmp`）を自動作成するよう修正

## Changes

- **セキュリティ改善**
  - 単一マスターキーからユーザーごとのAPIキー管理へ移行
  - APIエンドポイント数: 18個 → 22個（APIキー管理4個追加）
  - 認証方式の強化
    - マスターキー: 全ての権限（管理者用）
    - ユーザーAPIキー: スコープとレート制限でアクセス制御
  - 監査ログによる全APIリクエストの追跡

## Performance

（変更内容をここに記載）

## Refactoring

（変更内容をここに記載）

## Repository Management

（変更内容をここに記載）

## Internal Improvements

- **テスト追加**
  - 認証機能のユニットテスト（`tests/unit/auth.test.ts`）- 7件
  - APIキー管理のE2Eテスト（`tests/e2e/api-keys.test.ts`）- 9件
- D1データベースへのバッチインポート機能実装
  - TSVファイルからSQLへの変換処理
  - 1000件ずつの分割バッチ処理
  - 大量データ（13,809件）のインポート対応
  - 全カラム（race、level、atk、def、description等）のフルデータインポート完了
  - import-cards.tsの出力先を`./tmp/`に変更
- FAQ関連のインポートスクリプト追加
  - `import-remaining-faqs.ts`: 残りのFAQインポート
  - `import-rule-faqs.ts`: ルールFAQインポート
  - `rebuild-faq-card-references.ts`: FAQとカードの参照再構築
- スキーマ更新
  - カードテーブルに追加カラム（race、monsterTypes、spellEffectType、trapEffectType、linkMarkers、linkValue）
  - APIキーテーブル追加（api_keys、api_logs）

## Known Issues

（変更内容をここに記載）
