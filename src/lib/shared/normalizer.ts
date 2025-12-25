/**
 * 環境非依存の共通ロジック
 * CLIとWebアプリで共有する純粋関数のみを含む
 */

/**
 * カード名を検索用に正規化する関数
 *
 * 以下の処理を行う：
 * - 空白文字（全角・半角）を削除
 * - 記号類を削除
 * - 漢字の異体字を統一（竜→龍、剣→劍）
 * - 全角英数字を半角に変換
 * - 小文字に統一
 * - ひらがなをカタカナに変換
 *
 * @param str 正規化する文字列
 * @returns 正規化された文字列
 */
export function normalizeForSearch(str: string): string {
  if (!str) return ''
  return str
    // Remove all whitespace (full-width and half-width)
    .replace(/[\s\u3000]+/g, '')
    // Remove common symbols (both full-width and half-width)
    .replace(/[・★☆※‼！？。、,.，．:：;；「」『』【】〔〕（）()［］\[\]｛｝{}〈〉《》〜～~\-－_＿\/／\\＼|｜&＆@＠#＃$＄%％^＾*＊+＋=＝<＜>＞'"\"'""''`´｀]/g, '')
    // Normalize kanji variants: 竜→龍, 剣→劍, etc.
    .replace(/竜/g, '龍')
    .replace(/剣/g, '劍')
    // Convert full-width alphanumeric to half-width
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
    // Convert to lowercase
    .toLowerCase()
    // Convert hiragana to katakana
    .replace(/[\u3041-\u3096]/g, (s) => String.fromCharCode(s.charCodeAt(0) + 0x60))
}

/**
 * ネガティブ検索パターンのパース結果
 */
export interface NegativePatternResult {
  /** ポジティブ検索パターン */
  positive: string
  /** ネガティブ検索パターンのリスト */
  negative: string[]
}

/**
 * ネガティブ検索パターンをパースする
 *
 * 形式: -(space|　)-"phrase" or -'phrase' or -`phrase`
 * 例: "青眼 -\"儀式\"" → { positive: "青眼", negative: ["儀式"] }
 *
 * @param patternStr パターン文字列
 * @returns パース結果
 */
export function parseNegativePatterns(patternStr: string): NegativePatternResult {
  const negativePatterns: string[] = []
  let positivePattern = patternStr

  // Match patterns: (^ or space or fullwidth space) followed by - followed by quoted phrase
  const negativeRegex = /(^|[\s\u3000])-["'`]([^"'`]+)["'`]/g
  let match: RegExpExecArray | null

  while ((match = negativeRegex.exec(patternStr)) !== null) {
    negativePatterns.push(match[2])
  }

  // Remove negative patterns from the positive search
  if (negativePatterns.length > 0) {
    positivePattern = patternStr.replace(/(^|[\s\u3000])-["'`]([^"'`]+)["'`]/g, '').trim()
  }

  return { positive: positivePattern, negative: negativePatterns }
}

/**
 * レーベンシュタイン距離を計算する
 *
 * 2つの文字列間の編集距離を計算します。
 *
 * @param s1 文字列1
 * @param s2 文字列2
 * @returns レーベンシュタイン距離
 */
export function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length
  const len2 = s2.length

  // Create a 2D array to store distances
  const dp: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0))

  // Initialize base cases
  for (let i = 0; i <= len1; i++) dp[i][0] = i
  for (let j = 0; j <= len2; j++) dp[0][j] = j

  // Fill in the rest of the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,      // deletion
        dp[i][j - 1] + 1,      // insertion
        dp[i - 1][j - 1] + cost // substitution
      )
    }
  }

  return dp[len1][len2]
}

/**
 * レーベンシュタイン距離の許容閾値を決定する
 *
 * 短い文字列ほど厳しく（距離1）、長い文字列ほど緩く（距離3）設定
 * - 3文字以下: 距離1（1文字の違いまで許容）
 * - 7文字以下: 距離2（2文字の違いまで許容）
 * - 8文字以上: 距離3（3文字の違いまで許容）
 *
 * @param patternLength パターンの長さ
 * @returns 許容距離
 */
export function getAllowedDistance(patternLength: number): number {
  if (patternLength <= 3) return 1
  if (patternLength <= 7) return 2
  return 3
}

/**
 * ファジーマッチングを行う
 *
 * パターンに近い文字列を検索します。
 * 注意: スライディングウィンドウによる部分文字列チェックは、
 * 長いテキストに対して計算コストが高くなる可能性があります (O(n*m))
 *
 * @param val 検索対象の値
 * @param pattern 検索パターン
 * @returns マッチするかどうか
 */
export function fuzzyMatch(val: string, pattern: string): boolean {
  // First check for exact substring match
  if (val.includes(pattern)) return true

  // Calculate distance and check against threshold
  const distance = levenshteinDistance(val, pattern)
  const allowedDistance = getAllowedDistance(pattern.length)

  if (distance <= allowedDistance) return true

  // Also check if pattern is a fuzzy substring of val
  // Slide a window of pattern length over val and check each
  // パフォーマンス注意: この処理はO(n*m)の計算量となる
  if (val.length >= pattern.length) {
    for (let i = 0; i <= val.length - pattern.length; i++) {
      const substring = val.substring(i, i + pattern.length)
      const subDist = levenshteinDistance(substring, pattern)
      if (subDist <= allowedDistance) return true
    }
  }

  return false
}

/**
 * JSON配列フィールドのリスト
 */
const JSON_ARRAY_FIELDS = ['monsterTypes']

/**
 * フィールドがJSON配列データを含むかを判定する
 *
 * @param fieldName フィールド名
 * @returns JSON配列フィールドかどうか
 */
export function isJsonArrayField(fieldName: string): boolean {
  return JSON_ARRAY_FIELDS.includes(fieldName)
}

/**
 * JSON配列フィールドを安全にパースする
 *
 * @param jsonStr JSON文字列
 * @returns パースされた配列（失敗時は空配列）
 */
export function parseJsonArray(jsonStr: string): string[] {
  try {
    const parsed = JSON.parse(jsonStr)
    if (Array.isArray(parsed)) {
      return parsed.map(v => String(v))
    }
  } catch (e) {
    // If parsing fails, return empty array
  }
  return []
}

/**
 * 値がパターンにマッチするかを判定する
 *
 * @param val 検索対象の値
 * @param pattern 検索パターン
 * @param mode マッチングモード ('exact' | 'partial')
 * @param flagAutoModify 自動正規化フラグ
 * @param isNameField name フィールドかどうか
 * @param normalizedVal 事前に正規化された値（オプション）
 * @param flagAllowWild ワイルドカード許可フラグ
 * @param isTextField text フィールドかどうか
 * @param flagNearly ファジーマッチングフラグ
 * @param fieldName フィールド名
 * @returns マッチするかどうか
 */
export function valueMatches(
  val: string,
  pattern: any,
  mode: string,
  flagAutoModify: boolean = false,
  isNameField: boolean = false,
  normalizedVal?: string,
  flagAllowWild: boolean = false,
  isTextField: boolean = false,
  flagNearly: boolean = false,
  fieldName: string = ''
): boolean {
  val = val === undefined || val === null ? '' : String(val)
  if (pattern === null || pattern === undefined) return true

  // Handle JSON array fields (monsterTypes, linkMarkers, imgs)
  if (isJsonArrayField(fieldName)) {
    const arrayValues = parseJsonArray(val)
    // Check if pattern matches any value in the array (OR condition)
    return arrayValues.some(arrayVal => {
      const patternStr = String(pattern)
      // Use exact matching for array field elements
      return arrayVal === patternStr || arrayVal.toLowerCase() === patternStr.toLowerCase()
    })
  }

  const patternStr = String(pattern)

  // Parse negative patterns (for text fields and name field)
  const { positive: positivePattern, negative: negativePatterns } = parseNegativePatterns(patternStr)

  // Check negative patterns first - if any match, exclude this card
  if (negativePatterns.length > 0) {
    for (const negPattern of negativePatterns) {
      if (val.includes(negPattern)) {
        return false
      }
    }
  }

  // If only negative patterns (no positive pattern), and we passed negative check, return true
  if (!positivePattern || positivePattern === '') {
    return negativePatterns.length > 0
  }

  // Apply wildcard matching for name and text fields if flagAllowWild is true and pattern contains *
  if ((isNameField || isTextField) && flagAllowWild && positivePattern.includes('*')) {
    // Protect * from normalization by temporarily replacing it
    const placeholder = '\uFFFF' // Use a character unlikely to appear in card names
    const protectedPattern = positivePattern.replace(/\*/g, placeholder)

    const targetVal = (isNameField && flagAutoModify)
      ? (normalizedVal !== undefined ? normalizedVal : normalizeForSearch(val))
      : val
    const normalizedPattern = (isNameField && flagAutoModify)
      ? normalizeForSearch(protectedPattern)
      : protectedPattern

    // Convert to regex: escape special chars, then replace placeholder with .*
    const regexPattern = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(new RegExp(placeholder, 'g'), '.*') // Convert placeholder to .*

    const regex = isTextField ? new RegExp(regexPattern) : new RegExp(`^${regexPattern}$`)
    return regex.test(targetVal)
  }

  // Apply normalization for name field if flagAutoModify is true
  if (isNameField && flagAutoModify) {
    // Use pre-computed nameModified if available, otherwise compute on the fly
    const normalized = normalizedVal !== undefined ? normalizedVal : normalizeForSearch(val)
    const normalizedPattern = normalizeForSearch(positivePattern)

    // Apply fuzzy matching if flagNearly is true
    if (flagNearly) {
      return fuzzyMatch(normalized, normalizedPattern)
    }

    if (mode === 'partial') return normalized.indexOf(normalizedPattern) !== -1
    return normalized === normalizedPattern
  }

  // Apply fuzzy matching for name field without normalization
  if (isNameField && flagNearly) {
    return fuzzyMatch(val, positivePattern)
  }

  // For text fields, always use substring matching
  if (isTextField) {
    return val.includes(positivePattern)
  }

  if (mode === 'partial') return val.indexOf(positivePattern) !== -1
  return val === positivePattern
}
