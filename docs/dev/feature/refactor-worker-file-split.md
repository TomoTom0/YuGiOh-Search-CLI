# worker.tsのファイル分割

## 現状
`src/worker.ts`ファイルは2300行を超えており、以下の機能が1つのファイルに混在している：
- ルーティング
- 認証
- 各エンドポイントのハンドラ
- ヘルパー関数
- 型定義

## 問題点
- ファイルが大きすぎてメンテナンス性が低下
- 可読性が悪い
- 将来的な拡張が困難

## 改善案
以下のようにファイルを分割する：

- `src/router.ts`: URLパスに基づいてリクエストを適切なハンドラに振り分けるルーターロジック
- `src/handlers/`: 各APIエンドポイントのハンドラ関数を格納するディレクトリ
  - `src/handlers/cardSearch.ts`
  - `src/handlers/faqSearch.ts`
  - など
- `src/utils/`: 認証、エラーレスポンス、正規化などのヘルパー関数
- `src/types.ts`: `Env` やその他の共有型定義

## 優先度
low

## 関連
- PR: #48
- Thread ID: PRRT_kwDOQXVzac5s62iE
- タスク: TASK-115
- 関連ファイル: src/worker.ts
