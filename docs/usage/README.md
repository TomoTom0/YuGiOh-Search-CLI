# ユーザーガイド・スキーマドキュメント

このディレクトリにはプロジェクトの使用方法とデータ仕様に関するドキュメントが置かれています。

## クイックスタート

### インストール・ビルド

[build-and-run.md](build-and-run.md) - 環境セットアップからビルド、テスト実行まで

### CLI コマンド使用方法

- [usage.md](usage.md) - 基本的な使用例、検索パターン、環境変数設定
- [shell-commands.md](shell-commands.md) - 全コマンドの詳細リファレンス

### スキーマ・データ仕様

[schema.md](schema.md) - TSV ファイル（cards-all.tsv、detail-all.tsv、faq-all.tsv）のカラム定義と構造

## ファイル一覧

### build-and-run.md
- プロジェクトのセットアップ
- ビルド方法
- テスト実行
- bun link でのグローバルコマンド登録

### usage.md
- CLI コマンドの基本的な使用例
- 検索パターンの説明（{flexible}、《exact》、{{name|id}}）
- ワイルドカード・マイナス検索の使い方
- 環境変数の設定方法
- 各種出力形式

### shell-commands.md
- 7 つの CLI コマンドの詳細リファレンス
  - ygo_search - カード検索
  - ygo_bulk_search - 一括検索
  - ygo_extract - パターン抽出
  - ygo_replace - パターン置換
  - ygo_seek - ランダム/範囲選択
  - ygo_faq_search - FAQ 検索
  - ygo_convert - フォーマット変換
- 各コマンドの全オプション説明
- 使用例

### schema.md
データベースファイル（TSV）のカラム定義と構造を詳細に説明しています。

**対象ファイル:**
- `cards-all.tsv` - カード基本情報（13,754 枚）
- `detail-all.tsv` - カード詳細情報
- `faq-all.tsv` - 公式 FAQ（12,578 件）

**内容:**
- 各カラムの型、説明、検索対応状況
- 正規化ルール
- ワイルドカード・マイナス検索の使い方
- 使用例

### schema.yaml
スキーマ定義の YAML 形式版（参考資料）
