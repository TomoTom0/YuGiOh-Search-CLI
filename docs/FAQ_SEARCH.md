# FAQ Search Feature

## Overview

FAQ検索機能を実装しました。Yu-Gi-Oh! OCG公式FAQデータベース（12,578件）を高速に検索でき、質問・回答に登場するカード情報を自動的に埋め込んで返します。

## 主な機能

### 1. FAQ ID検索
特定のFAQを直接取得
```bash
ygo_faq_search '{"faqId":100}'
```

### 2. カードID検索（逆引きインデックス）
指定したカードが登場する全FAQを瞬時に検索
```bash
ygo_faq_search '{"cardId":6808,"limit":5}'
```

### 3. 質問文検索
質問内容から関連FAQを検索（ワイルドカード対応）
```bash
ygo_faq_search '{"question":"シンクロ召喚","limit":10}'
ygo_faq_search '{"question":"*墓地*","limit":10}'
```

### 4. 回答文検索
裁定内容から関連FAQを検索
```bash
ygo_faq_search '{"answer":"効果を無効化","limit":10}'
ygo_faq_search '{"answer":"*ダメージ*","limit":20}'
```

## レスポンス構造

各FAQ結果には以下が含まれます：

```typescript
{
  faq: {
    faqId: number,
    question: string,
    answer: string,
    updatedAt: string,
    
    // 質問文に登場するカードの完全な情報
    questionCards: Card[],
    
    // 回答文に登場するカードの完全な情報
    answerCards: Card[],
    
    // 全カードIDのリスト
    allCardIds: number[]
  }
}
```

### カード情報の自動埋め込み

FAQの質問・回答文中の `{{カード名|カードID}}` パターンを自動解析し、以下の情報を付加します：

- カード名、ルビ
- カードタイプ（モンスター/魔法/罠）
- 効果テキスト
- ステータス（攻撃力、守備力、レベル、種族、属性など）
- 画像ハッシュ

## パフォーマンス最適化

### 1. インメモリキャッシュ
- FAQ全データ（12,578件、約16MB）をメモリに保持
- 起動時に1回のみロード
- 2回目以降の検索は即座に完了

### 2. カードID逆引きインデックス
```typescript
// 構造: { cardId: [faqId, faqId, ...] }
Map<number, number[]>
```
- カードID検索が O(1) で完了
- 例：カードID 6808 → 該当FAQ一覧を即座に取得

### 3. 正規化済みテキスト
- 起動時に全FAQの質問・回答を正規化
- 検索時の正規化処理を省略
- 半角全角、カタカナひらがな、記号などを統一

### 4. ワイルドカード最適化
- `*` を正規表現に変換
- 前方一致・後方一致・部分一致に対応

## 実装詳細

### ファイル構成
```
src/
  types/
    faq.ts                  # FAQ型定義
  utils/
    faq-loader.ts           # FAQローダーとインデックス構築
  search-faq.ts             # FAQ検索メイン処理
  cli/
    ygo_faq_search.ts       # CLIコマンド
  ygo-search-card-server.ts # MCP統合
```

### データフロー
```
1. faq-all.tsv 読み込み
   ↓
2. {{name|id}} パターン抽出
   ↓
3. カードID逆引きインデックス構築
   ↓
4. 正規化テキスト生成
   ↓
5. インメモリキャッシュ
   ↓
6. 検索クエリ実行
   ↓
7. カード情報の埋め込み
   ↓
8. 結果返却
```

## MCP統合

### ツール名
`search_faq`

### パラメータ
```typescript
{
  faqId?: number,           // FAQ ID検索
  cardId?: number,          // カードID検索
  question?: string,        // 質問文検索
  answer?: string,          // 回答文検索
  limit?: number,           // 最大結果数（デフォルト: 50）
  flagAllowWild?: boolean,  // ワイルドカード有効化（デフォルト: true）
  outputPath?: string,      // 出力ファイルパス
  outputDir?: string        // 出力ディレクトリ
}
```

### 使用例（Claude Desktop）
```
FAQを検索してください：
- カードID 6808 に関するFAQ
- 「シンクロ召喚」について
- 効果無効化に関する裁定
```

## CLI使用例

### インストール後
```bash
npm link  # グローバルインストール
ygo_faq_search '{"cardId":6808}'
```

### 直接実行
```bash
node dist/search-faq.js '{"cardId":6808}'
```

### ヘルプ表示
```bash
ygo_faq_search --help
```

## 今後の拡張可能性

### Phase 3: カードスペック検索（✅ 実装済み）
```bash
# レベル8のドラゴン族に関するFAQ
ygo_faq_search cardFilter.race=dragon cardFilter.levelValue=8
# または
ygo_faq_search '{"cardFilter":{"race":"dragon","levelValue":"8"}}'
```

実装済み：
1. カード検索でスペックに合致するカードを取得
2. それらのカードIDでFAQ検索
3. 結果をマージ

### Phase 3: バルク検索
```bash
# 複数のFAQ検索を一度に実行
ygo_faq_search '[
  {"cardId":6808},
  {"question":"シンクロ召喚"},
  {"faqId":100}
]'
```

## パフォーマンス測定

### 初回ロード
- FAQ読み込み: ~0.5秒
- インデックス構築: ~0.3秒
- カードデータ読み込み: ~0.5秒
- **合計: ~1.3秒**

### 2回目以降の検索
- キャッシュヒット: **即座（<10ms）**
- カード情報埋め込み: ~50ms（カード数に依存）

### メモリ使用量
- FAQデータ: ~16MB
- カードデータ: ~8MB
- インデックス: ~2MB
- **合計: ~26MB**（許容範囲）

## データソース

- **FAQ数**: 12,578件
- **カード数**: 13,754枚
- **言語**: 日本語
- **更新**: 2017年時点のデータ

## まとめ

✅ **実装完了**
- FAQ検索（ID、カードID、質問、回答）
- カード情報自動埋め込み
- 高速インデックス検索
- CLI・MCP統合

🚀 **パフォーマンス**
- インメモリキャッシュで高速化
- O(1) カードID検索
- 正規化済みテキストで効率化

📚 **使いやすさ**
- ワイルドカード対応
- 豊富な検索オプション
- 既存ツールとの統合
