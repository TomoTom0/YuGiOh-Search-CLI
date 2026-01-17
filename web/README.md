# 遊戯王カード検索 - Webアプリケーション

ブラウザで動作する遊戯王カード検索Webアプリケーションです。

## 技術スタック

- **フレームワーク**: Vue.js 3 (Composition API)
- **ビルドツール**: Vite
- **言語**: TypeScript
- **データローダー**: fetch + IndexedDB（ブラウザ専用実装）

## 開発環境のセットアップ

```bash
# 依存関係のインストール
bun install

# データファイルの準備（初回のみ）
# プロジェクトルートで以下を実行してTSVデータを取得
cd .. && bun run update && cd web

# public/data/tsv/ にTSVファイルを配置
mkdir -p public/data/tsv
cp ~/.local/ygo-search/*.tsv public/data/tsv/
# 開発サーバーの起動 (http://localhost:40100)
bun run dev

# ビルド
bun run build

# プレビュー（本番ビルドの確認）
bun run preview
```

### ビルド時に含まれるファイル

ビルド時に以下のファイルが `dist/` に自動でコピーされます：

- `public/data/tsv/` - カード・FAQデータ（TSV形式）
- `../docs/` - APIドキュメント（vite-plugin-static-copyによるコピー）
## ディレクトリ構造

```
web/
├── src/
│   ├── components/     # Vueコンポーネント
│   ├── lib/            # ブラウザ専用ロジック
│   ├── App.vue         # ルートコンポーネント
│   └── main.ts         # エントリーポイント
├── public/
│   └── data/           # 静的データファイル（TSV等）
├── index.html          # HTMLテンプレート
├── vite.config.ts      # Vite設定
└── package.json        # Web専用パッケージ設定
```

## 共通ロジックの再利用

CLIとWebアプリで共有する環境非依存のロジック（正規化関数等）は、プロジェクトルートの `src/lib/shared/` に配置されています。

```typescript
// 共通ロジックのインポート例
import { normalizeForSearch } from '../../src/lib/shared/normalizer.js'
```

## データローダーの実装

Webアプリではファイルシステムアクセスができないため、以下の方針でデータをロードします：

1. **初回ロード**: `public/data/` 配下のTSVファイルを fetch でロード
2. **キャッシュ**: IndexedDB にデータを保存
3. **高速検索**: メモリ上のデータ構造で検索を実行

## 設計方針

- CLIとWebアプリは完全に独立したプロジェクト
- 共通ロジックは `src/lib/shared/` で再利用
- データローダーはWeb専用に新規実装（Node.js API非依存）
- 初回ロード時にバックグラウンドでTSVデータをプリロード
