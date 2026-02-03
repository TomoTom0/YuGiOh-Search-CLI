#!/bin/bash
# 本番環境の動作確認スクリプト

# .envファイルから環境変数を読み込む
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

PROD_URL="${PROD_URL:-https://ygo-search.api.scioj.com}"
API_SECRET="${API_SECRET}"

if [ -z "$API_SECRET" ]; then
  echo "エラー: API_SECRET環境変数が設定されていません"
  echo "使用方法: API_SECRET=your-token ./scripts/verify-deployment.sh"
  echo "または、プロジェクトルートの.envファイルにAPI_SECRETを設定してください"
  exit 1
fi

echo "======================================"
echo "本番環境動作確認"
echo "URL: $PROD_URL"
echo "認証: あり"
echo "======================================"
echo ""

# 認証付きcurl関数（共通）
# 元のcurlコマンドをオーバーライドして、自動的に認証ヘッダーを追加
curl() {
  /usr/bin/curl -H "X-API-Secret: $API_SECRET" "$@"
}

# テスト結果カウンタ
PASSED=0
FAILED=0

test_endpoint() {
  local name="$1"
  local test_cmd="$2"

  echo "【テスト】$name"
  if result=$(eval "$test_cmd" 2>&1); then
    echo "✓ 成功"
    echo "結果: $result"
    ((PASSED++))
  else
    echo "✗ 失敗"
    echo "エラー: $result"
    ((FAILED++))
  fi
  echo ""
}

# 1. ヘルスチェック（認証不要）
test_endpoint "ヘルスチェック（認証不要）" \
  "/usr/bin/curl -s '$PROD_URL/health' | jq -e '.status == \"healthy\"' > /dev/null && /usr/bin/curl -s '$PROD_URL/health' | jq -c '{status, timestamp}'"

# 2. 統計情報
test_endpoint "統計情報" \
  "curl -s '$PROD_URL/api/stats' | jq -e '.cards > 0 and .faqs > 0' > /dev/null && curl -s '$PROD_URL/api/stats' | jq -c '{cards, faqs}'"

# 3. カード検索（名前完全一致）
test_endpoint "カード検索（名前）" \
  "curl -s -G --data-urlencode 'filter[name]=青眼の白龍' '$PROD_URL/api/cards/search' | jq -e '.data | length > 0' > /dev/null && curl -s -G --data-urlencode 'filter[name]=青眼の白龍' '$PROD_URL/api/cards/search' | jq -c '{total, first_card: .data[0].name}'"

# 4. カード検索（ID）
test_endpoint "カードID検索" \
  "curl -s '$PROD_URL/api/cards/by-id?id=4007' | jq -e '.card_id == \"4007\"' > /dev/null && curl -s '$PROD_URL/api/cards/by-id?id=4007' | jq -c '{card_id, name, card_type}'"

# 5. セマンティック検索
test_endpoint "セマンティック検索" \
  "curl -s -G --data-urlencode 'q=ドラゴン' --data-urlencode 'limit=3' '$PROD_URL/api/cards/semantic-search' | jq -e '.data | length > 0' > /dev/null && curl -s -G --data-urlencode 'q=ドラゴン' --data-urlencode 'limit=3' '$PROD_URL/api/cards/semantic-search' | jq -c '{total, query}'"

# 6. カードパターン抽出
test_endpoint "カードパターン抽出" \
  "curl -s -X POST -H 'Content-Type: application/json' -d '{\"text\":\"Use {青眼} card\"}' '$PROD_URL/api/cards/extract' | jq -e '.total > 0' > /dev/null && curl -s -X POST -H 'Content-Type: application/json' -d '{\"text\":\"Use {青眼} card\"}' '$PROD_URL/api/cards/extract' | jq -c '{total, first_match: .matches[0].pattern}'"

# 7. カードパターン置換
test_endpoint "カードパターン置換" \
  "curl -s -X POST -H 'Content-Type: application/json' -d '{\"text\":\"Use {青眼の白龍} card\"}' '$PROD_URL/api/cards/replace' | jq -e '.processedPatterns | length > 0' > /dev/null && curl -s -X POST -H 'Content-Type: application/json' -d '{\"text\":\"Use {青眼の白龍} card\"}' '$PROD_URL/api/cards/replace' | jq -c '{hasUnprocessed, status: .processedPatterns[0].status}'"

# 8. ランダムカード取得
test_endpoint "ランダムカード取得" \
  "curl -s '$PROD_URL/api/cards/seek?max=5&random=true' | jq -e '.data | length > 0' > /dev/null && curl -s '$PROD_URL/api/cards/seek?max=5&random=true' | jq -c '{total}'"

# 9. 一括検索
test_endpoint "一括検索" \
  "curl -s -X POST -H 'Content-Type: application/json' -d '{\"queries\":[{\"filter\":{\"name\":\"青眼の白龍\"},\"limit\":1},{\"filter\":{\"attribute\":\"dark\"},\"limit\":2}]}' '$PROD_URL/api/cards/bulk' | jq -e '.results | length == 2' > /dev/null && curl -s -X POST -H 'Content-Type: application/json' -d '{\"queries\":[{\"filter\":{\"name\":\"青眼の白龍\"},\"limit\":1}]}' '$PROD_URL/api/cards/bulk' | jq -c '{query_count: .results | length}'"

# 10. フォーマット変換
test_endpoint "フォーマット変換" \
  "curl -s -X POST -H 'Content-Type: application/json' -d '{\"input\":\"[{\\\"id\\\":1}]\",\"inputFormat\":\"json\",\"outputFormat\":\"jsonl\"}' '$PROD_URL/api/convert' | jq -e '.converted' > /dev/null && curl -s -X POST -H 'Content-Type: application/json' -d '{\"input\":\"[{\\\"id\\\":1}]\",\"inputFormat\":\"json\",\"outputFormat\":\"jsonl\"}' '$PROD_URL/api/convert' | jq -c '{inputFormat, outputFormat}'"

# 11. FAQ検索
test_endpoint "FAQ検索" \
  "curl -s -G --data-urlencode 'q=召喚' --data-urlencode 'limit=3' '$PROD_URL/api/faqs/search' | jq -e 'has(\"data\")' > /dev/null && curl -s -G --data-urlencode 'q=召喚' --data-urlencode 'limit=3' '$PROD_URL/api/faqs/search' | jq -c '{total, query}'"

# 12. APIドキュメント（認証不要）
test_endpoint "APIドキュメント（認証不要）" \
  "/usr/bin/curl -s '$PROD_URL/api/docs?list' | jq -e '.endpoints | length > 0' > /dev/null && /usr/bin/curl -s '$PROD_URL/api/docs?list' | jq -c '{version, endpoint_count: .total}'"

echo "======================================"
echo "テスト結果"
echo "======================================"
echo "成功: $PASSED"
echo "失敗: $FAILED"
echo ""

if [ $FAILED -gt 0 ]; then
  echo "⚠ 一部のテストが失敗しました"
  exit 1
else
  echo "✓ 全てのテストが成功しました"
  exit 0
fi
