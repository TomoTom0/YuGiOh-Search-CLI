# YGO Search Workers (Rust)

遊戯王カード検索機能をRustで実装し、Cloudflare Workersで動作させるプロジェクトです。

## 機能

### コア機能（実装済み）

1. **正規化処理** (`normalize_for_search`)
   - 空白削除、記号削除、異体字統一、全角→半角、ひらがな→カタカナ、小文字化
   - 9つのテストケースで検証済み

2. **パターン抽出** (`PatternExtractor`)
   - CardId (`{{name|cardId}}`)、Exact (`《name》`)、Flexible (`{name}`) の3種類のパターンに対応
   - 優先順位順で抽出、ネストしたパターンを除外
   - 11のテストケースで検証済み

3. **パターン置換** (`PatternReplacer`)
   - 5種類の置換ステータス（Resolved, Multiple, NotFound, Corrected, AlreadyProcessed）
   - 9つのテストケースで検証済み

4. **カード検索** (`CardSearcher`)
   - 完全一致検索、あいまい検索、ワイルドカード検索、ID検索
   - 正規化機能と統合
   - 9つのテストケースで検証済み

5. **FAQ検索** (`FAQSearcher`)
   - テキスト検索、カードID検索、カード参照抽出
   - 9つのテストケースで検証済み

### Cloudflare Workers統合（進行中）

- REST APIエンドポイント
- D1データベース統合（準備中）
- Vectorize統合（準備中）
- Workers AI統合（準備中）

## プロジェクト構造

```
rust/
├── src/
│   ├── lib.rs                    # ライブラリエントリーポイント
│   ├── normalize/                # 正規化処理
│   │   ├── mod.rs
│   │   ├── normalizer.rs         # 正規化ロジック
│   │   ├── pattern.rs            # パターン抽出
│   │   └── replace.rs            # パターン置換
│   ├── search/                   # カード検索
│   │   ├── mod.rs
│   │   ├── types.rs              # Card型定義
│   │   └── card_search.rs        # 検索ロジック
│   ├── faq/                      # FAQ検索
│   │   ├── mod.rs
│   │   ├── types.rs              # FAQRecord型定義
│   │   └── faq_search.rs         # FAQ検索ロジック
│   └── workers/                  # Cloudflare Workers
│       ├── mod.rs                # Workers エントリーポイント
│       ├── types.rs              # API型定義
│       └── handlers.rs           # APIハンドラー
├── Cargo.toml                    # パッケージ設定
├── wrangler.toml                 # Workers設定
├── schema.sql                    # D1スキーマ
└── README.md                     # このファイル
```

## テスト

```bash
# 全テストを実行
cargo test

# 特定のモジュールのテストのみ実行
cargo test normalize::
cargo test search::
cargo test faq::

# テスト数: 48
# - normalize::normalizer: 9
# - normalize::pattern: 11
# - normalize::replace: 9
# - search::card_search: 9
# - faq::faq_search: 9
# - lib.rs: 1
```

## ビルド

### ローカルビルド（テスト用）

```bash
cargo build
cargo build --release
```

### Cloudflare Workers用ビルド

```bash
# worker-buildツールをインストール（初回のみ）
cargo install worker-build

# Workersビルド
worker-build --release

# または wrangler経由でビルド
wrangler build
```

## デプロイ

### D1データベースのセットアップ

```bash
# D1データベースを作成
wrangler d1 create ygo-search

# スキーマを適用
wrangler d1 execute ygo-search --file=schema.sql

# データをインポート
# 1. カードデータの準備
tsx scripts/import-cards.ts <path/to/cards.tsv> <path/to/cards-detail.tsv>

# 2. D1にインポート
wrangler d1 execute ygo-search --file=import-cards.sql

# 3. FAQデータの準備
tsx scripts/import-faqs.ts <path/to/faq-all.tsv>

# 4. D1にインポート
wrangler d1 execute ygo-search --file=import-faqs.sql
```

### Vectorizeのセットアップ

```bash
# Vectorizeインデックスを作成（384次元、コサイン類似度）
wrangler vectorize create ygo-search-vectors --dimensions=384 --metric=cosine
```

### デプロイ

```bash
# 開発環境にデプロイ
wrangler deploy

# 本番環境にデプロイ
wrangler deploy --env production
```

## API エンドポイント

### 正規化

```
POST /api/normalize
Content-Type: application/json

{
  "text": "青眼　の　白竜"
}

Response:
{
  "normalized": "青眼ノ白龍"
}
```

### パターン抽出

```
POST /api/patterns/extract
Content-Type: application/json

{
  "text": "Use {青眼の白龍} and {{ブラック・マジシャン|5678}}",
  "include_start_index": true
}

Response:
{
  "patterns": [
    {
      "pattern": "{{ブラック・マジシャン|5678}}",
      "pattern_type": "cardId",
      "query": "5678",
      "original_name": "ブラック・マジシャン",
      "start_index": 22
    },
    {
      "pattern": "{青眼の白龍}",
      "pattern_type": "flexible",
      "query": "青眼の白龍",
      "start_index": 4
    }
  ]
}
```

### パターン置換

```
POST /api/patterns/replace
Content-Type: application/json

{
  "text": "Use {青眼の白龍} and {NotFound}",
  "mount_par": false
}

Response:
{
  "processed_text": "Use {{青眼の白龍|4007}} and {{NOTFOUND_`NotFound`}}",
  "has_unprocessed": true,
  "warnings": ["⚠️ Text contains unprocessed patterns that require manual review", "Found 1 pattern(s) with no matches (NOTFOUND_*)"],
  "processed_patterns": [
    {
      "original": "{青眼の白龍}",
      "replaced": "{{青眼の白龍|4007}}",
      "status": "resolved"
    },
    {
      "original": "{NotFound}",
      "replaced": "{{NOTFOUND_`NotFound`}}",
      "status": "notfound"
    }
  ]
}
```

### カード検索

```
POST /api/search/cards
Content-Type: application/json

{
  "query": "青眼",
  "limit": 10
}

Response:
{
  "cards": [
    {
      "card_id": "4007",
      "name": "青眼の白龍",
      "normalized_name": "青眼ノ白龍",
      "card_type": "通常モンスター",
      "attribute": "光",
      "level": 8,
      "atk": 3000,
      "def": 2500,
      "description": "高い攻撃力を誇る伝説のドラゴン。"
    }
  ]
}
```

### FAQ検索

```
POST /api/search/faqs
Content-Type: application/json

{
  "card_id": "4007",
  "limit": 10
}

Response:
{
  "faqs": [
    {
      "faq_id": 1,
      "card_id": "4007",
      "question": "青眼の白龍の攻撃力は？",
      "answer": "攻撃力は3000です。",
      "card_references": [],
      "card_info": {
        "card_id": "4007",
        "name": "青眼の白龍",
        "normalized_name": "青眼ノ白龍"
      }
    }
  ]
}
```

## 開発ロードマップ

- [x] Phase 1: コア機能実装
  - [x] 正規化処理
  - [x] パターン抽出
  - [x] パターン置換
  - [x] カード検索（ロジック）
  - [x] FAQ検索（ロジック）

- [x] Phase 2: Cloudflare Workers統合
  - [x] Workers API基盤
  - [x] wrangler設定
  - [x] D1スキーマ定義
  - [x] D1統合実装
  - [ ] Vectorize統合実装
  - [ ] Workers AI統合実装

- [x] Phase 3: データインポート
  - [x] TSVからD1へのインポートスクリプト
  - [ ] ベクトルインデックス構築

- [ ] Phase 4: 本番デプロイ
  - [ ] パフォーマンス最適化
  - [ ] エラーハンドリング強化
  - [ ] ログとモニタリング

## ライセンス

MIT
