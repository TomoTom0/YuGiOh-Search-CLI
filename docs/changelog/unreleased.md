# 次期バージョン（未リリース）

## New Features

- Cloudflare Workers API実装
  - カード検索エンドポイント (`/api/cards/search`)
  - FAQ検索エンドポイント (`/api/faqs/search`)
  - セマンティック検索エンドポイント（カード・FAQ）
  - 統計情報エンドポイント (`/api/stats`)
  - レート制限機能（60リクエスト/分）
  - キャッシュ機能（1時間TTL）
- カード検索機能の実装（Phase 0完了）
  - 種族検索（race）
  - カード種別検索（cardType）
  - レベル検索（level）
  - 攻撃力・守備力検索（atk/def）
  - テキスト検索（description）
  - モンスタータイプ検索（monsterTypes）
  - 魔法・罠タイプ検索（spellEffectType/trapEffectType）
  - リンクマーカー検索（linkMarkers）
  - ソート機能（ORDER BY）

## Bug Fixes

- `src/worker.ts`の`searchCardsExtended`関数で同じ条件が3回重複していたバグを修正
- `rust/scripts/import-cards.ts`でlevelValueとsupplementInfoの読み込み修正

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
  - 大量データ（13,809件）のインポート対応
  - 全カラム（race、level、atk、def、description等）のフルデータインポート完了
  - import-cards.tsの出力先を`./tmp/`に変更
- FAQ関連のインポートスクリプト追加
  - `import-remaining-faqs.ts`: 残りのFAQインポート
  - `import-rule-faqs.ts`: ルールFAQインポート
  - `rebuild-faq-card-references.ts`: FAQとカードの参照再構築
- スキーマ更新
  - カードテーブルに追加カラム（race、monsterTypes、spellEffectType、trapEffectType、linkMarkers、linkValue）

## Known Issues

（変更内容をここに記載）
