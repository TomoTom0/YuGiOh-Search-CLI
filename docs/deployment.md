# 本番デプロイ手順

## 前提条件

- Cloudflareアカウント
- Cloudflare Workers（無料プラン）
- Cloudflare D1（無料プラン: 5GB）
- Cloudflare R2（無料プラン: 10GB/月）
- Cloudflare Vectorize（無料プラン: 3000万次元/月）
- Azure OpenAI API Key（埋め込み生成用）
- wrangler CLI (`npm install -g wrangler`)

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
npx wrangler d1 execute ygo-search-db --remote --file rust/schema.sql

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

## 7. Workersのデプロイ

```bash
# ワーカーのビルド
bun run build

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

```bash
# カードデータのベクトル化（Azure OpenAI APIを使用）
curl -X POST https://ygo-search.api.scioj.com/api/vectorize/cards

# FAQデータのベクトル化（Azure OpenAI APIを使用）
curl -X POST https://ygo-search.api.scioj.com/api/vectorize/faqs
```

## 10. 動作確認

### 自動テストスクリプトの実行

```bash
# 動作確認スクリプトを実行
chmod +x scripts/verify-deployment.sh
./scripts/verify-deployment.sh
```

### 手動確認

```bash
PROD_URL="https://ygo-search.api.scioj.com"

# ヘルスチェック
curl "$PROD_URL/health"

# 統計情報
curl "$PROD_URL/api/stats"

# カード検索（名前検索）
curl -G --data-urlencode 'filter[name]=青眼の白龍' "$PROD_URL/api/cards/search"

# カード検索（セマンティック検索）
curl -G --data-urlencode 'q=ドラゴン' --data-urlencode 'limit=5' "$PROD_URL/api/cards/semantic-search"

# FAQ検索
curl -G --data-urlencode 'q=召喚' --data-urlencode 'limit=5' "$PROD_URL/api/faqs/search"

# カードパターン抽出
curl -X POST -H "Content-Type: application/json" -d '{"text":"Use {青眼} card"}' "$PROD_URL/api/cards/extract"

# APIドキュメント
curl "$PROD_URL/api/docs?list"
```

## APIエンドポイント一覧

### 基本機能（3エンドポイント）

| エンドポイント | メソッド | 説明 |
|------------|---------|------|
| `/health` | GET | ヘルスチェック |
| `/api/stats` | GET | 統計情報取得（カード数、FAQ数） |
| `/api/docs` | GET | APIドキュメント（`?list`でエンドポイント一覧） |

### カード検索（7エンドポイント）

| エンドポイント | メソッド | 説明 |
|------------|---------|------|
| `/api/cards/search` | GET | フィルタ検索（名前、属性、種族など） |
| `/api/cards/by-id` | GET | カードIDで検索 |
| `/api/cards/seek` | GET | ランダムまたは範囲指定でカード取得 |
| `/api/cards/bulk` | POST | 一括検索（最大50クエリ） |
| `/api/cards/extract` | POST | テキストからカードパターン抽出 |
| `/api/cards/replace` | POST | カードパターンを正規化形式に置換 |
| `/api/cards/semantic-search` | GET | セマンティック検索（意味検索） |

### FAQ検索（2エンドポイント）

| エンドポイント | メソッド | 説明 |
|------------|---------|------|
| `/api/faqs/search` | GET | キーワード検索 |
| `/api/faqs/semantic-search` | GET | セマンティック検索 |

### ベクトル関連（4エンドポイント）

| エンドポイント | メソッド | 説明 | 認証 |
|------------|---------|------|------|
| `/api/vectorize/cards` | POST | カードデータのベクトル化（全件） | 不要 |
| `/api/vectorize/faqs` | POST | FAQデータのベクトル化（全件） | 不要 |
| `/api/vector/setup` | POST | ベクトルセットアップ（バッチ処理） | 必要 |
| `/api/vector/setup-generic` | POST | 汎用ベクトルセットアップ | 必要 |

### ユーティリティ（2エンドポイント）

| エンドポイント | メソッド | 説明 | 認証 |
|------------|---------|------|------|
| `/api/convert` | POST | フォーマット変換（JSON/JSONL/YAML） | 不要 |
| `/api/update` | POST | R2からデータ更新 | 必要 |

**合計**: 18エンドポイント

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
