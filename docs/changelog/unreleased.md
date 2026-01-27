# 次期バージョン（未リリース）

## New Features

- Cloudflare Workers API実装
  - カード検索エンドポイント (`/api/cards/search`)
  - FAQ検索エンドポイント (`/api/faqs/search`)
  - セマンティック検索エンドポイント（カード・FAQ）
  - 統計情報エンドポイント (`/api/stats`)
  - レート制限機能（60リクエスト/分）
  - キャッシュ機能（1時間TTL）

## Bug Fixes

（変更内容をここに記載）

## Changes

（変更内容をここに記載）

## Performance

（変更内容をここに記載）

## Refactoring

（変更内容をここに記載）

## Repository Management

（変更内容をここに記載）

## Internal Improvements

- D1データベースへのバッチインポート機能実装
  - TSVファイルからSQLへの変換処理
  - 1000件ずつの分割バッチ処理
  - 大量データ（13,808件）のインポート対応
- FAQ関連のインポートスクリプト追加
  - `import-remaining-faqs.ts`: 残りのFAQインポート
  - `import-rule-faqs.ts`: ルールFAQインポート
  - `rebuild-faq-card-references.ts`: FAQとカードの参照再構築
- スキーマ更新
  - カードテーブルに追加カラム（race、monsterTypes、spellEffectType、trapEffectType、linkMarkers、linkValue）

## Known Issues

（変更内容をここに記載）
