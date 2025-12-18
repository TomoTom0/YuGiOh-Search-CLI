# ドキュメント

このディレクトリにはプロジェクトのドキュメントが置かれています。

## クイックスタート

### インストール・セットアップ

[BUILD_AND_RUN.md](BUILD_AND_RUN.md) - ビルドと開発環境のセットアップ

### 使用方法

- [USAGE.md](USAGE.md) - CLI コマンドの使用例と設定
- [SHELL_COMMANDS.md](SHELL_COMMANDS.md) - 全 CLI コマンドのリファレンス

## ドキュメント構成

### 直下ファイル

#### BUILD_AND_RUN.md
ビルド、開発環境のセットアップ、テスト実行などの開発者向けガイド

#### SHELL_COMMANDS.md
全 CLI コマンド（ygo_search、ygo_bulk_search、ygo_extract、ygo_replace、ygo_seek、ygo_faq_search、ygo_convert）の詳細なリファレンス

#### USAGE.md
CLI コマンドの使用例、検索パターン、環境変数の設定方法

### サブディレクトリ

#### [usage/](usage/README.md)
データベース仕様・スキーマドキュメント

- `schema.md` - TSV ファイル（cards-all.tsv、detail-all.tsv、faq-all.tsv）のカラム定義
- `schema.yaml` - スキーマの YAML 形式版

#### [tasks/](tasks/README.md)
PR レビュー対応とタスク管理の記録

- `pr4-review-comments.md` - PR #4 レビュー対応
- `pr6-review-comments.md` - PR #6 レビュー対応
- `pr9-review-comments.md` - PR #9 レビュー対応
- `branch-protection-review-2025-11-18.md` - ブランチ保護ルール検討

#### [dev/](dev/README.md)
開発履歴とトラブルシューティング記録

- `records/` - マージ競合解決、重要な開発決定の記録

## ドキュメント選択ガイド

### こんな時は...

**「どのように使うのか？」** → [USAGE.md](USAGE.md)

**「全コマンドのオプションを確認したい」** → [SHELL_COMMANDS.md](SHELL_COMMANDS.md)

**「インストールしたい、ビルドしたい」** → [BUILD_AND_RUN.md](BUILD_AND_RUN.md)

**「TSV ファイルのスキーマを知りたい」** → [usage/schema.md](usage/schema.md)

**「開発環境をセットアップしたい」** → [BUILD_AND_RUN.md](BUILD_AND_RUN.md)

## 関連ドキュメント

プロジェクトルートの重要なドキュメント：

- [README.md](/README.md) - プロジェクト概要
- [CHANGELOG.md](/CHANGELOG.md) - リリース履歴（バージョン v1.0.0 ～ v1.3.0）
