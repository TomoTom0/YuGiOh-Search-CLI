# 開発向けドキュメント

このディレクトリには、開発・保守作業に関する記録とドキュメントが置かれています。

## ディレクトリ構成

### records/
開発履歴、マージ競合解決記録など、過去の開発作業の記録を保存しています。

**例:**
- `2025-11-19_merge-conflict-resolution.md` - マージ競合の解決記録

### feature/
開発決定・技術的負債の記録

- `m2-t2-filter-engine-decisions.md` - M2-T2 フィルタエンジンの技術的決定
- `m2-t3-seek-pipeline-decisions.md` - M2-T3 seekパイプラインの技術的決定
- `m3-t1-t2-vector-search-embedding-decisions.md` - M3-T1/T2 ベクトル検索・埋め込みの技術的決定
- `m3-t3-indexer-decisions.md` - M3-T3 インデックス構築の技術的決定
- `m3-t4-model-pinning.md` - M3-T4 モデル整合性検証（revision/hash pinning）
- `deploy-workers-toolchain-rot.md` - Workersデプロイツールチェーン腐敗の技術的負債
- `format-yaml-serde-yaml-deprecated.md` - format-yaml serde_yaml 非推奨化の技術的負債

### その他ドキュメント
- [cloudflare-workers-api-development-plan.md](cloudflare-workers-api-development-plan.md) - Cloudflare Workers API開発計画と設計方針
- [sdk-feature-gap-investigation.md](sdk-feature-gap-investigation.md) - TS/Rust SDK 機能差分調査（カバレッジマトリクス・欠損一覧・移植可能性）
- [m0-t2-contract.md](m0-t2-contract.md) - M0-T2 契約凍結の判断記録（SpellEffectType / cardId 型 / serde rename 戦略・M1/M3 境界）
- [m0-t3-searchcards-filter-spec.md](m0-t3-searchcards-filter-spec.md) - M0-T3 仕様確定（SpellEffectType=quick 統一 / searchCards filter 仕様・M2-T2 spec fixture）

## 用途

このディレクトリは主に以下の目的で使用されます：

- 複雑なマージ競合の解決プロセスの記録
- 重要な開発決定の履歴
- トラブルシューティングの記録
- アーキテクチャ検討の記録

## 関連ドキュメント

### ユーザー向け
- [ビルド・開発環境セットアップ](../usage/build-and-run.md)
- [使用方法](../usage/usage.md)

### リポジトリ構造
- [プロジェクト概要](../../README.md)
- [リリース履歴](../../CHANGELOG.md)
