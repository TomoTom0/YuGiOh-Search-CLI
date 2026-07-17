# 本番デプロイ手順

## ⚠️ 重要: ローカル開発と本番環境の分離

**ローカル開発では必ずローカルD1を使用してください。本番D1に直接アクセスしないでください。**

- **ローカル開発**: `wrangler dev` → ローカルD1を使用（`preview_database_id = "local"`により自動）
- **本番デプロイ**: `wrangler deploy` → 本番D1を使用

> **作業ディレクトリ（Cargo workspace 移行後）**: `wrangler.toml` は `crates/ygo-search-workers/` に移動しました。`wrangler dev` / `wrangler deploy` / binding(`DB`/`VECTORIZE`/`AI`) を用いるコマンドは同ディレクトリ配下で実行してください（例: `cd crates/ygo-search-workers && wrangler deploy`）。`wrangler d1 execute <db名>` のように DB 名を直接指定するコマンドは任意のディレクトリで実行可能です。

詳細は[README.md - Development Setup](../README.md#development-setup-for-contributors)を参照してください。

## 前提条件

- Cloudflareアカウント
- Cloudflare Workers（無料プラン）
- Cloudflare D1（無料プラン: 5GB）
- Cloudflare R2（無料プラン: 10GB/月）
- Cloudflare Vectorize（無料プラン: 3000万次元/月）
- Azure OpenAI API Key（埋め込み生成用）
- wrangler CLI (`pnpm add --global wrangler`)

## 現在のデプロイ環境

- **本番URL**: https://ygo-search.api.scioj.com
- **Workers URL**: https://ygo-search.arukuki4.workers.dev (カスタムドメインでアクセス可能)
- **D1データベース**: ygo-search-db (1d6b90bc-b61a-4f61-8d3d-63822422db52)
- **Vectorize Index**: ygo-search-vectors (1536次元)
- **R2バケット**: ygo-search-data

## 1. Cloudflareへのログイン

```bash
npx wrangler login
```

## 2. D1データベースの作成

```bash
# 本番用D1データベース作成
wrangler d1 create ygo-search-db

# wrangler.tomlのdatabase_idを更新（表示されたIDで置き換える）
database_id = "<表示されたID>"
```

## 3. データベーススキーマの適用

```bash
# スキーマ適用
npx wrangler d1 execute ygo-search-db --remote --file crates/ygo-search-workers/sql/schema.sql

# スキーマ確認
npx wrangler d1 execute ygo-search-db --remote --command "PRAGMA table_info(cards)"
```

**重要**: 既存データベースにカラムを追加する場合は、`ALTER TABLE`を使用してください：

```bash
npx wrangler d1 execute ygo-search-db --remote --command "ALTER TABLE cards ADD COLUMN ruby TEXT"
npx wrangler d1 execute ygo-search-db --remote --command "ALTER TABLE cards ADD COLUMN normalized_ruby TEXT"
```

## 4. データのインポート

カードデータのインポート:

```bash
# カードデータのインポート
for i in tmp/sql-batches/batch-*.sql; do
  wrangler d1 execute DB --remote --file "$i"
done
```

FAQデータのインポート:

```bash
# FAQデータのインポート
for i in tmp/sql-batches-faq/batch-*.sql; do
  wrangler d1 execute DB --remote --file "$i"
done
```

## 5. Vectorizeインデックスの作成

```bash
# Vectorizeインデックス作成（text-embedding-3-smallは1536次元）
wrangler vectorize create ygo-search-vectors --dimension=1536
```

## 6. 環境変数とシークレットの設定

```bash
# API認証キーを設定（必須）
wrangler secret put API_SECRET
# プロンプトで強力なランダムキーを入力
# 生成例: openssl rand -base64 32

# Azure OpenAI API Keyをシークレットとして設定
wrangler secret put AZURE_API_KEY
# プロンプトでAzure OpenAI API Keyを入力

# Azure OpenAI Endpointをシークレットとして設定
wrangler secret put AZURE_ENDPOINT
# プロンプトでAzure OpenAI Endpointを入力（例: https://xxx.openai.azure.com/）

# 環境変数の設定
wrangler secret put ENVIRONMENT --production
# プロンプトで "production" を入力
```

**重要**: API_SECRETはマスターキーとして機能し、全ての権限を持ちます。強力なランダム文字列を設定してください。

### APIキー管理システムの初期設定

データベースマイグレーションを適用してAPIキー管理機能を有効化します：

```bash
# マイグレーション適用（本番環境）
wrangler d1 migrations apply ygo-search-db --remote

# テーブルが作成されたことを確認
wrangler d1 execute ygo-search-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('api_keys', 'api_logs');"
```

## 7. Workersのデプロイ

```bash
# ワーカーのビルド
pnpm run build

# デプロイ
wrangler deploy
```

## 8. カスタムドメインの設定

Cloudflareダッシュボードで以下の設定を行います：

1. Cloudflareダッシュボードにログイン
2. Workers & Pages > ygo-search を選択
3. Settings > Domains & Routes タブを開く
4. Add Custom Domain をクリック
5. カスタムドメインを入力: `ygo-search.api.scioj.com`
6. DNS設定が自動的に追加されることを確認

**注意**: カスタムドメインを使用するには、`scioj.com` がCloudflareで管理されている必要があります。

## 9. ベクトル化の実行

管理者用APIキー（`vectorize`スコープ付き）で実行できます：

```bash
source .env.local  # ADMIN_API_KEYを読み込み

# カードデータのベクトル化（Azure OpenAI APIを使用）
curl -X POST https://ygo-search.api.scioj.com/api/vectorize/cards \
  -H "X-API-Secret: $ADMIN_API_KEY"

# FAQデータのベクトル化（Azure OpenAI APIを使用）
curl -X POST https://ygo-search.api.scioj.com/api/vectorize/faqs \
  -H "X-API-Secret: $ADMIN_API_KEY"
```

**注意**: ベクトル化には`vectorize`スコープが必要です。一般ユーザー用APIキーにこのスコープを付与しないでください。

## 10. 動作確認

### 自動テストスクリプトの実行

**重要**: セキュリティ上の理由により、動作確認には管理者用APIキー（`ADMIN_API_KEY`）が必須です。

#### 前提条件

管理者用APIキーが発行済みで、`.env.local`に保存されていること（セクション6の「初回セットアップ：管理者用APIキーの発行」を参照）。

#### スクリプト実行

```bash
# 動作確認スクリプトを実行（.env.localから自動読み込み）
chmod +x scripts/verify-deployment.sh
./scripts/verify-deployment.sh
```

`.env.local`に`ADMIN_API_KEY`が設定されていない場合、エラーメッセージが表示され、初回セットアップ手順が案内されます。

#### 直接指定（非推奨）

```bash
# 環境変数で直接指定する場合
ADMIN_API_KEY="your-admin-api-key" ./scripts/verify-deployment.sh
```

**注意**: マスターキー（`API_SECRET`）でのテスト実行は非推奨です。セキュリティベストプラクティスに従い、管理者用APIキーを使用してください。

### 手動確認

**認証について**: ほとんどのエンドポイントは認証が必要です。認証不要: `/health`, `/api/docs`

**推奨**: 日常的なAPI利用には管理者用APIキー（`ADMIN_API_KEY`）を使用してください。

```bash
PROD_URL="https://ygo-search.api.scioj.com"
ADMIN_API_KEY="your-admin-api-key"  # .env.localから取得

# ヘルスチェック（認証不要 - 監視用）
curl "$PROD_URL/health"

# APIドキュメント（認証不要）
curl "$PROD_URL/api/docs?list"

# 統計情報（認証必要）
curl -H "X-API-Secret: $ADMIN_API_KEY" "$PROD_URL/api/stats"

# カード検索（名前検索、認証必要）
curl -H "X-API-Secret: $ADMIN_API_KEY" \
  -G --data-urlencode 'filter[name]=青眼の白龍' "$PROD_URL/api/cards/search"

# カード検索（セマンティック検索、認証必要）
curl -H "X-API-Secret: $ADMIN_API_KEY" \
  -G --data-urlencode 'q=ドラゴン' --data-urlencode 'limit=5' \
  "$PROD_URL/api/cards/semantic-search"

# FAQ検索（認証必要）- キーワード検索
curl -H "X-API-Secret: $ADMIN_API_KEY" \
  -G --data-urlencode 'q=召喚' --data-urlencode 'limit=5' "$PROD_URL/api/faqs/search"

# FAQ検索 - カード名で検索
curl -H "X-API-Secret: $ADMIN_API_KEY" \
  -G --data-urlencode 'cardName=増援' "$PROD_URL/api/faqs/search"

# FAQ検索 - カードフィルタで検索（POST）
curl -H "X-API-Secret: $ADMIN_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{"cardFilter":{"race":"warrior"},"limit":5}' "$PROD_URL/api/faqs/search"

# カードパターン抽出（認証必要）
curl -H "X-API-Secret: $ADMIN_API_KEY" \
  -X POST -H "Content-Type: application/json" \
  -d '{"text":"Use {青眼} card"}' "$PROD_URL/api/cards/extract"
```

**認証ヘッダーの形式**:
- `X-API-Secret: your-token` （推奨）
- `Authorization: Bearer your-token` （代替）

### APIキー管理の使い方

**重要**: マスターキー（`API_SECRET`）は管理操作専用です。**管理者も含め、日常的な運用ではユーザーAPIキーを使用してください**。

#### 初回セットアップ：管理者用APIキーの発行

デプロイ後、まず管理者用のAPIキーを発行します：

```bash
PROD_URL="https://ygo-search.api.scioj.com"
API_SECRET="<マスターキー>"  # wrangler secret put で設定した値

# 管理者用APIキーの発行（初回のみマスターキーを使用）
curl -X POST "$PROD_URL/api/keys" \
  -H "X-API-Secret: $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "admin",
    "name": "Admin Daily Use Key",
    "scopes": ["cards:read", "faqs:read", "stats:read", "convert", "vectorize"],
    "rateLimit": 10000
  }'

# レスポンス例：
# {
#   "apiKey": "abc123...",
#   "userId": "admin",
#   "name": "Admin Daily Use Key",
#   ...
# }

# 発行されたAPIキーを.env.localに保存
echo 'ADMIN_API_KEY="<発行されたAPIキー>"' >> .env.local
```

**以降は`ADMIN_API_KEY`を使用し、マスターキーは緊急時・管理操作時のみ使用します。**

#### 一般ユーザー用APIキーの発行

```bash
# 管理者用APIキーでユーザーにAPIキーを発行
curl -X POST "$PROD_URL/api/keys" \
  -H "X-API-Secret: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "name": "Production Key",
    "scopes": ["cards:read", "faqs:read"],
    "rateLimit": 1000
  }'

# 発行されたAPIキーを保存
USER_API_KEY="<発行されたAPIキー>"

# ユーザーAPIキーで認証
curl -H "X-API-Secret: $USER_API_KEY" "$PROD_URL/api/stats"
```

#### 日常的なAPI利用（管理者用APIキーを使用）

```bash
# カード検索など、日常的なAPI利用は管理者用APIキーを使用
curl -H "X-API-Secret: $ADMIN_API_KEY" "$PROD_URL/api/stats"
curl -H "X-API-Secret: $ADMIN_API_KEY" \
  -G --data-urlencode 'filter[name]=青眼の白龍' "$PROD_URL/api/cards/search"

# 自分のAPIキー一覧を確認
curl -H "X-API-Secret: $ADMIN_API_KEY" "$PROD_URL/api/keys"
```

#### 管理操作（マスターキーを使用）

**以下の操作はマスターキーが必要です**：
- 全ユーザーのAPIキー一覧取得
- 他ユーザーのAPIキー削除
- 新しいユーザーへのAPIキー発行

```bash
# 全APIキー一覧の取得（マスターキーのみ）
curl -H "X-API-Secret: $API_SECRET" "$PROD_URL/api/keys"

# 全API使用ログの取得（マスターキーのみ）
curl -H "X-API-Secret: $API_SECRET" "$PROD_URL/api/keys/logs?limit=100"

# 任意のAPIキーの無効化（マスターキーのみ）
curl -X DELETE "$PROD_URL/api/keys/$USER_API_KEY" \
  -H "X-API-Secret: $API_SECRET"

# 新しいユーザーへのAPIキー発行（マスターキーのみ）
curl -X POST "$PROD_URL/api/keys" \
  -H "X-API-Secret: $API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user-456", "name": "User Key", "scopes": ["cards:read"], "rateLimit": 1000}'
```

**スコープの種類**:

| スコープ | 説明 | エンドポイント例 |
|---------|------|----------------|
| `cards:read` | カード検索・参照 | `/api/cards/search`, `/api/cards/by-id` |
| `faqs:read` | FAQ検索・参照 | `/api/faqs/search` |
| `stats:read` | 統計情報取得 | `/api/stats` |
| `convert` | フォーマット変換 | `/api/convert` |
| `vectorize` | ベクトル化 | `/api/vectorize/cards` |
| `admin` | データ更新 | `/api/update` |

**セキュリティ上の利点**:
- **管理者も日常的にはユーザーAPIキーを使用** - マスターキー漏洩リスクを最小化
- ユーザーごとにAPIキーを管理できる
- 特定ユーザーのみアクセスを取り消せる
- 全APIリクエストが監査ログに記録される（ユーザーAPIキー使用時）
- レート制限をユーザーごとに設定可能
- **スコープによるアクセス制御** - 必要最小限の権限のみ付与

**マスターキーの使用は最小限に**：
- APIキー発行時のみ
- 他ユーザーのAPIキー削除時のみ
- 緊急時のアクセス時のみ

## APIエンドポイント一覧

**認証**: ほとんどのエンドポイントは`X-API-Secret`ヘッダーが必要です。認証不要: `/health`, `/api/docs`

### 基本機能（3エンドポイント）

| エンドポイント | メソッド | 認証 | 説明 |
|------------|---------|------|------|
| `/health` | GET | 不要 | ヘルスチェック（監視・死活監視用） |
| `/api/stats` | GET | 必要 | 統計情報取得（カード数、FAQ数） |
| `/api/docs` | GET | 不要 | APIドキュメント（`?list`でエンドポイント一覧） |

### カード検索（7エンドポイント）

| エンドポイント | メソッド | 認証 | 説明 |
|------------|---------|------|------|
| `/api/cards/search` | GET | 必要 | フィルタ検索（名前、属性、種族など） |
| `/api/cards/by-id` | GET | 必要 | カードIDで検索 |
| `/api/cards/seek` | GET | 必要 | ランダムまたは範囲指定でカード取得 |
| `/api/cards/bulk` | POST | 必要 | 一括検索（最大50クエリ） |
| `/api/cards/extract` | POST | 必要 | テキストからカードパターン抽出 |
| `/api/cards/replace` | POST | 必要 | カードパターンを正規化形式に置換 |
| `/api/cards/semantic-search` | GET | 必要 | セマンティック検索（意味検索） |

### FAQ検索（2エンドポイント）

| エンドポイント | メソッド | 認証 | 説明 |
|------------|---------|------|------|
| `/api/faqs/search` | GET, POST | 必要 | FAQ検索（faqId/cardId/cardName/cardFilter/question/answer/allowWild対応） |
| `/api/faqs/semantic-search` | GET | 必要 | セマンティック検索 |

### ベクトル関連（4エンドポイント）

| エンドポイント | メソッド | 認証 | 説明 |
|------------|---------|------|------|
| `/api/vectorize/cards` | POST | 必要 | カードデータのベクトル化（全件、Azure OpenAI使用） |
| `/api/vectorize/faqs` | POST | 必要 | FAQデータのベクトル化（全件、Azure OpenAI使用） |
| `/api/vector/setup` | POST | 必要 | ベクトルセットアップ（バッチ処理） |
| `/api/vector/setup-generic` | POST | 必要 | 汎用ベクトルセットアップ |

### ユーティリティ（2エンドポイント）

| エンドポイント | メソッド | 認証 | 説明 |
|------------|---------|------|------|
| `/api/convert` | POST | 必要 | フォーマット変換（JSON/JSONL/YAML） |
| `/api/update` | POST | 必要 | R2からデータ更新（Cron対応） |

### APIキー管理（4エンドポイント）

| エンドポイント | メソッド | 認証 | 説明 |
|------------|---------|------|------|
| `/api/keys` | POST | マスターキーのみ | APIキー発行（ユーザーID、スコープ、レート制限を指定） |
| `/api/keys` | GET | 必要 | APIキー一覧（マスターキー:全件、ユーザーキー:自分のみ） |
| `/api/keys/:id` | DELETE | 必要 | APIキー無効化（マスターキー:全件、ユーザーキー:自分のみ） |
| `/api/keys/logs` | GET | 必要 | API使用ログ取得（マスターキー:全件、ユーザーキー:自分のみ） |

**合計**: 22エンドポイント

### レスポンスフォーマット

全てのAPIレスポンスは**キャメルケース**で返されます。

#### カード情報（`/api/cards/by-id`、`/api/cards/search`等）

```json
{
  "cardId": "22593",
  "name": "ミラクル・エクスクルーダー",
  "ruby": "",
  "nameModified": "ミラクルエクスクルーダー",
  "cardType": "monster",
  "text": "カードテキスト...",
  "attribute": "earth",
  "levelType": "level",
  "levelValue": "3",
  "race": "spellcaster",
  "monsterTypes": "[\"effect\"]",
  "atk": "400",
  "def": "400",
  "linkMarkers": null,
  "spellEffectType": null,
  "trapEffectType": null
}
```

**重要**: データベースはスネークケース（`card_id`, `description`）ですが、APIレスポンスはキャメルケース（`cardId`, `text`）に自動変換されます。

## データ更新方法

データを更新する場合:

1. TSVファイルを更新
2. SQLバッチファイルを再生成
3. データをクリアして再インポート
4. ベクトル化を再実行

```bash
# データのクリア
wrangler d1 execute DB --remote --command "DELETE FROM cards;"
wrangler d1 execute DB --remote --command "DELETE FROM faqs;"

# インポート再実行
for i in tmp/sql-batches/batch-*.sql; do
  wrangler d1 execute DB --remote --file "$i"
done

# ベクトル化再実行
curl -X POST https://ygo-search.api.scioj.com/api/vectorize/cards
curl -X POST https://ygo-search.api.scioj.com/api/vectorize/faqs
```

## ローカルでのテスト

ローカル環境でテストする場合:

```bash
# .envファイルにAzure OpenAIの設定を追加
echo "AZURE_API_KEY=your-key" >> .env
echo "AZURE_MODEL=text-embedding-3-small" >> .env
echo "AZURE_ENDPOINT=https://your-resource.openai.azure.com/" >> .env

# ローカル開発サーバー起動
wrangler dev --local

# テスト
curl http://localhost:8787/health
```
