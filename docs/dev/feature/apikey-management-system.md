# APIキー管理システムの実装

## 現状

- 単一の `API_SECRET` 環境変数を全ユーザーで共有
- ユーザーごとのAPIキー発行・管理機能なし
- 誰がAPIを使用しているか追跡不可

## 問題点

### セキュリティ
- キー漏洩時に全ユーザー分を変更せざるを得ない
- 特定ユーザーのアクセスを取り消せない

### 運用
- 誰がいつAPIを使用したか追跡不可能（監査ログなし）
- 複数クライアント向けのサービス提供が困難
- レート制限をユーザーごとに設定不可

### スケーラビリティ
- ユーザー数増加に対応できない

## 改善案

### データベース設計（D1）

```sql
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT,
  scopes TEXT, -- JSON array: ["cards:read", "faqs:read"]
  rate_limit INTEGER DEFAULT 1000, -- 時間あたりのリクエスト数
  is_active BOOLEAN DEFAULT true,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_used_at DATETIME,
  expires_at DATETIME
);

CREATE TABLE api_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);
```

### エンドポイント設計

| エンドポイント | 機能 | 認証 |
|-------------|------|------|
| `POST /api/keys` | APIキー発行 | 管理者用マスターキー |
| `GET /api/keys` | 自分のキー一覧 | APIキー |
| `DELETE /api/keys/:id` | キー無効化 | APIキー |
| `GET /api/keys/logs` | 自分の使用ログ | APIキー |
| `GET /admin/keys` | 全キー管理（管理者） | 管理者用 |

### 実装ステップ

1. **認証ミドルウェアの拡張**
   - `checkAuth` を拡張してユーザーAPIキーも受け付ける
   - キー検証・レート制限チェック

2. **認可機能の追加**
   - スコープ（scope）によるアクセス制御

3. **監査ログ**
   - 全API呼び出しのログ記録
   - 管理者用ダッシュボード（将来的）

## 優先度

**high** - セキュリティ・運用上の重大な問題

## 関連

- 実装ファイル: `src/lib/worker/auth.ts`
- エンドポイント: `src/worker.ts`
- ドキュメント: `docs/deployment.md`
