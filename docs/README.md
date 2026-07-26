# ドキュメント

このディレクトリにはプロジェクトのドキュメントが置かれています。

## クイックスタート

### インストール・セットアップ

[usage/build-and-run.md](usage/build-and-run.md) - ビルドと開発環境のセットアップ

### 使用方法

- [usage/usage.md](usage/usage.md) - CLI コマンドの使用例と設定
- [usage/shell-commands.md](usage/shell-commands.md) - 全 CLI コマンドのリファレンス

## ドキュメント構成

### [usage/](usage/README.md)
ユーザーガイド・スキーマドキュメント

- `build-and-run.md` - ビルド・開発環境セットアップ
- `usage.md` - CLI コマンド使用例と設定
- `shell-commands.md` - 全コマンドのリファレンス
- `schema.md` - TSV ファイル（cards-all.tsv、detail-all.tsv、faq-all.tsv）のカラム定義
- `schema.yaml` - スキーマの YAML 形式版

### [dev/](dev/README.md)
開発履歴とトラブルシューティング記録

- `records/` - マージ競合解決、重要な開発決定の記録
- `cloudflare-workers-api-development-plan.md` - Cloudflare Workers API開発計画
- `sdk-feature-gap-investigation.md` - TS/Rust SDK 機能覆盖差分調査（覆盖マトリクス・欠損一覧・移植可能性）
- `m0-t2-contract.md` - M0-T2 契約凍結の判断記録（SpellEffectType / cardId 型 / serde rename 戦略・M1/M3 境界）
- `m0-t3-searchcards-filter-spec.md` - M0-T3 仕様確定（SpellEffectType=quick 統一 / searchCards filter 仕様・M2-T2 spec fixture）
- `feature/` - 技術的負債の記録（PRレビュー指摘・将来改善案・スケール時懸念）

### Cloudflare Workers API
Web APIのデプロイと運用

- [deployment.md](deployment.md) - 本番デプロイ手順、エンドポイント一覧、環境設定

## ドキュメント選択ガイド

### こんな時は...

**「どのように使うのか？」** → [usage/usage.md](usage/usage.md)

**「全コマンドのオプションを確認したい」** → [usage/shell-commands.md](usage/shell-commands.md)

**「インストールしたい、ビルドしたい」** → [usage/build-and-run.md](usage/build-and-run.md)

**「TSV ファイルのスキーマを知りたい」** → [usage/schema.md](usage/schema.md)

## 関連ドキュメント

プロジェクトルートの重要なドキュメント：

- [README.md](/README.md) - プロジェクト概要
- [.github/CICD.md](/.github/CICD.md) - CI/CD 設定（test.yml / rust-ci.yml / pr-validation.yml）
- [CHANGELOG.md](/CHANGELOG.md) - リリース履歴（バージョン v1.0.0 ～ v1.3.0）
