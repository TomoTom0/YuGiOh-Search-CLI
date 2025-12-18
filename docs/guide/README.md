# ユーザーガイド

このディレクトリにはプロジェクトの使用方法とセットアップガイドが置かれています。

## クイックスタート

### 1. インストール・ビルド

[BUILD_AND_RUN.md](BUILD_AND_RUN.md) - 環境セットアップからビルド、テスト実行まで

### 2. CLI コマンドの使用

- [USAGE.md](USAGE.md) - 基本的な使用例、検索パターン、環境変数設定
- [SHELL_COMMANDS.md](SHELL_COMMANDS.md) - 全コマンドの詳細リファレンス

## ファイル一覧

### BUILD_AND_RUN.md
- プロジェクトのセットアップ
- ビルド方法
- テスト実行
- bun link でのグローバルコマンド登録

### USAGE.md
- CLI コマンドの基本的な使用例
- 検索パターンの説明（{flexible}、《exact》、{{name|id}}）
- ワイルドカード・マイナス検索の使い方
- 環境変数の設定方法
- 各種出力形式

### SHELL_COMMANDS.md
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

## 関連ドキュメント

### データ仕様
[docs/usage/schema.md](/usage/schema.md) - TSV ファイルのスキーマ定義

### 開発向け
[docs/dev/](/dev/) - 開発履歴・記録

### プロジェクト全体
[docs/README.md](/) - ドキュメント全体の目次
