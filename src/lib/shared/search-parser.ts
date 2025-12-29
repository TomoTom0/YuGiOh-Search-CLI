/**
 * 検索クエリパーサー
 * マイナス検索、フレーズ検索、正規表現検索に対応
 */

/**
 * パース結果のインターフェース
 */
export interface ParsedSearchQuery {
  /** ポジティブ検索ワード（通常の検索ワード） */
  positive: string[]
  /** ネガティブ検索ワード（除外ワード） */
  negative: string[]
  /** フレーズ検索（ダブルクォーテーションで囲まれた範囲） */
  phrases: string[]
  /** 正規表現パターン（reg:で始まる） */
  regexes: string[]
}

/**
 * 検索クエリをパースする
 *
 * @param query 検索クエリ文字列
 * @returns パース結果
 *
 * @example
 * // マイナス検索
 * parseSearchQuery('青眼 -儀式 -"融合"')
 * // => { positive: ['青眼'], negative: ['儀式', '融合'], phrases: [], regexes: [] }
 *
 * @example
 * // フレーズ検索
 * parseSearchQuery('"ブラック・マジシャン" "青眼の白龍"')
 * // => { positive: [], negative: [], phrases: ['ブラック・マジシャン', '青眼の白龍'], regexes: [] }
 *
 * @example
 * // 正規表現検索
 * parseSearchQuery('reg:青眼.* reg:"ブラック.*"')
 * // => { positive: [], negative: [], phrases: [], regexes: ['青眼.*', 'ブラック.*'] }
 *
 * @example
 * // 複合検索
 * parseSearchQuery('ドラゴン -"儀式" "青眼の白龍" reg:.*マジシャン')
 * // => { positive: ['ドラゴン'], negative: ['儀式'], phrases: ['青眼の白龍'], regexes: ['.*マジシャン'] }
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    positive: [],
    negative: [],
    phrases: [],
    regexes: []
  }

  if (!query || !query.trim()) {
    return result
  }

  // マッチした位置を記録（重複処理を避けるため）
  const matched: Array<{ start: number; end: number }> = []

  // 1. 正規表現パターンを抽出 (reg:pattern または reg:"pattern")
  const regexPattern = /reg:(?:"([^"]+)"|(\S+))/g
  let match: RegExpExecArray | null
  while ((match = regexPattern.exec(query)) !== null) {
    const pattern = match[1] || match[2]
    result.regexes.push(pattern)
    matched.push({ start: match.index, end: match.index + match[0].length })
  }

  // 2. ネガティブ検索を抽出 (-word または -"phrase")
  const negativePattern = /-(?:"([^"]+)"|(\S+))/g
  while ((match = negativePattern.exec(query)) !== null) {
    const word = match[1] || match[2]
    result.negative.push(word)
    matched.push({ start: match.index, end: match.index + match[0].length })
  }

  // 3. フレーズ検索を抽出 ("phrase")
  const phrasePattern = /"([^"]+)"/g
  while ((match = phrasePattern.exec(query)) !== null) {
    // 既にマッチした範囲と重複していないかチェック
    const isOverlapping = matched.some(m =>
      (match!.index >= m.start && match!.index < m.end) ||
      (match!.index + match![0].length > m.start && match!.index + match![0].length <= m.end)
    )

    if (!isOverlapping) {
      const phrase = match[1]
      result.phrases.push(phrase)
      matched.push({ start: match.index, end: match.index + match[0].length })
    }
  }

  // 4. 残りの単語をポジティブ検索ワードとして抽出
  // マッチした範囲を除外した文字列を作成
  let remaining = ''
  let lastEnd = 0

  // マッチ範囲をソート
  matched.sort((a, b) => a.start - b.start)

  for (const m of matched) {
    remaining += query.substring(lastEnd, m.start) + ' '
    lastEnd = m.end
  }
  remaining += query.substring(lastEnd)

  const words = remaining.split(/\s+/).filter(w => w.trim() && w !== '-' && !w.startsWith('reg:'))
  result.positive = words

  return result
}

/**
 * パース結果を使って文字列がマッチするかチェック
 *
 * @param text 検索対象の文字列
 * @param parsed パース済みの検索クエリ
 * @returns マッチするかどうか
 */
export function matchParsedQuery(text: string, parsed: ParsedSearchQuery): boolean {
  if (!text) return false

  // ネガティブ検索チェック（1つでもマッチしたら除外）
  for (const negWord of parsed.negative) {
    if (text.includes(negWord)) {
      return false
    }
  }

  // 正規表現チェック（すべてマッチする必要がある）
  for (const regexStr of parsed.regexes) {
    try {
      const regex = new RegExp(regexStr)
      if (!regex.test(text)) {
        return false
      }
    } catch (e) {
      // 無効な正規表現の場合はスキップ
      console.warn(`Invalid regex pattern: ${regexStr}`, e)
      return false
    }
  }

  // フレーズ検索チェック（すべてマッチする必要がある）
  for (const phrase of parsed.phrases) {
    if (!text.includes(phrase)) {
      return false
    }
  }

  // ポジティブ検索ワードチェック（すべてマッチする必要がある）
  for (const word of parsed.positive) {
    if (!text.includes(word)) {
      return false
    }
  }

  // すべての条件を満たした場合のみtrue
  return true
}
