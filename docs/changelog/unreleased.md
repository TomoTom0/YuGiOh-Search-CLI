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
- **Worker API レスポンスフォーマット修正**
  - データベースのスネークケース（`card_id`, `description`等）からキャメルケース（`cardId`, `text`等）への変換を実装
  - 全APIエンドポイントで`mapCardDbToApi`関数を使用してレスポンスを正規化
  - TypeScript型定義との整合性を確保
- **bulk-search.tsのD1_BINDING_ERROR修正**
  - `bindParams`から不要な`limit`/`offset`を削除（SQLクエリ文字列に直接埋め込まれているため）
  - 実行時の"Wrong number of bindings"エラーを解消
- **リンクモンスターのlevelValue修正**
  - リンクモンスターの`levelValue`が`undefined`になる問題を修正
  - `level`列から直接取得するように実装を簡素化（`link_value`列は常にNULLのため使用しない）

## Changes

（変更内容をここに記載）

## Performance

（変更内容をここに記載）

## Refactoring

- **データベーススキーマとインポートスクリプトの完全修正**
  - データベースに不足していた5つのカラムを追加（ciid, imgs, pendulum_scale, pendulum_text, is_extra_deck）
  - `import-cards.ts`を修正して全フィールドを正しくインポート
  - SQL文字列エスケープ処理を追加（改行、シングルクォート）
  - null値のハンドリングを修正（空文字列がNULLになる問題を解消）
  - 全13,809件のカードデータを再インポート

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
