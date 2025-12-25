import { describe, it, expect } from 'vitest'
import {
  normalizeForSearch,
  parseNegativePatterns,
  levenshteinDistance,
  getAllowedDistance,
  fuzzyMatch,
  isJsonArrayField,
  parseJsonArray,
  valueMatches
} from '../normalizer.js'

describe('normalizeForSearch', () => {
  it('空白文字を削除する', () => {
    expect(normalizeForSearch('青眼 の 白龍')).toBe('青眼ノ白龍')
    expect(normalizeForSearch('青眼　の　白龍')).toBe('青眼ノ白龍')
  })

  it('記号を削除する', () => {
    expect(normalizeForSearch('E・HERO フレイム・ウィングマン')).toBe('eheroフレイムウィングマン')
    expect(normalizeForSearch('No.39 希望皇ホープ')).toBe('no39希望皇ホープ')
  })

  it('漢字の異体字を統一する', () => {
    expect(normalizeForSearch('青眼の白竜')).toBe('青眼ノ白龍')
    expect(normalizeForSearch('聖剣')).toBe('聖劍')
  })

  it('全角英数字を半角に変換する', () => {
    expect(normalizeForSearch('ＡＢＣ－ドラゴン・バスター')).toBe('abcドラゴンバスター')
  })

  it('ひらがなをカタカナに変換する', () => {
    expect(normalizeForSearch('ぶらっく・まじしゃん')).toBe('ブラックマジシャン')
  })

  it('複合的な正規化を行う', () => {
    const input = '青眼　の　白竜　（ブルーアイズ・ホワイト・ドラゴン）'
    const expected = '青眼ノ白龍ブルーアイズホワイトドラゴン'
    expect(normalizeForSearch(input)).toBe(expected)
  })
})

describe('parseNegativePatterns', () => {
  it('ネガティブパターンをパースする', () => {
    const result = parseNegativePatterns('青眼 -"儀式"')
    expect(result.positive).toBe('青眼')
    expect(result.negative).toEqual(['儀式'])
  })

  it('複数のネガティブパターンをパースする', () => {
    const result = parseNegativePatterns('ドラゴン -"儀式" -"融合"')
    expect(result.positive).toBe('ドラゴン')
    expect(result.negative).toEqual(['儀式', '融合'])
  })

  it('シングルクォートとバッククォートもサポート', () => {
    const result1 = parseNegativePatterns("青眼 -'儀式'")
    expect(result1.negative).toEqual(['儀式'])

    const result2 = parseNegativePatterns('青眼 -`儀式`')
    expect(result2.negative).toEqual(['儀式'])
  })

  it('ネガティブパターンのみの場合', () => {
    const result = parseNegativePatterns(' -"儀式"')
    expect(result.positive).toBe('')
    expect(result.negative).toEqual(['儀式'])
  })
})

describe('levenshteinDistance', () => {
  it('同一文字列の距離は0', () => {
    expect(levenshteinDistance('abc', 'abc')).toBe(0)
  })

  it('1文字の挿入', () => {
    expect(levenshteinDistance('abc', 'abcd')).toBe(1)
  })

  it('1文字の削除', () => {
    expect(levenshteinDistance('abcd', 'abc')).toBe(1)
  })

  it('1文字の置換', () => {
    expect(levenshteinDistance('abc', 'adc')).toBe(1)
  })

  it('複数の操作', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3)
  })
})

describe('getAllowedDistance', () => {
  it('3文字以下は距離1', () => {
    expect(getAllowedDistance(1)).toBe(1)
    expect(getAllowedDistance(3)).toBe(1)
  })

  it('7文字以下は距離2', () => {
    expect(getAllowedDistance(4)).toBe(2)
    expect(getAllowedDistance(7)).toBe(2)
  })

  it('8文字以上は距離3', () => {
    expect(getAllowedDistance(8)).toBe(3)
    expect(getAllowedDistance(20)).toBe(3)
  })
})

describe('fuzzyMatch', () => {
  it('完全一致する場合', () => {
    expect(fuzzyMatch('青眼の白龍', '青眼の白龍')).toBe(true)
  })

  it('部分一致する場合', () => {
    expect(fuzzyMatch('青眼の白龍', '青眼')).toBe(true)
  })

  it('1文字違いの場合（短い文字列）', () => {
    // "abc" vs "adc" は距離1で、3文字なので許容距離1
    expect(fuzzyMatch('abc', 'adc')).toBe(true)
  })

  it('距離が閾値を超える場合', () => {
    // "abc" vs "xyz" は距離3で、3文字なので許容距離1を超える
    expect(fuzzyMatch('abc', 'xyz')).toBe(false)
  })

  it('部分文字列のファジーマッチ', () => {
    // "青眼の白龍" に "青眼の白竜" が含まれる（竜と龍は異なるがファジーマッチ可能）
    // ただし、normalizeForSearch を使わない場合は厳密
    expect(fuzzyMatch('青眼の白龍青眼の白龍', '青眼の白竜')).toBe(true)
  })
})

describe('isJsonArrayField', () => {
  it('monsterTypes は JSON 配列フィールド', () => {
    expect(isJsonArrayField('monsterTypes')).toBe(true)
  })

  it('その他のフィールドは JSON 配列フィールドではない', () => {
    expect(isJsonArrayField('name')).toBe(false)
    expect(isJsonArrayField('cardType')).toBe(false)
  })
})

describe('parseJsonArray', () => {
  it('有効な JSON 配列をパースする', () => {
    expect(parseJsonArray('["効果", "チューナー"]')).toEqual(['効果', 'チューナー'])
  })

  it('無効な JSON の場合は空配列を返す', () => {
    expect(parseJsonArray('invalid')).toEqual([])
  })

  it('配列でない場合は空配列を返す', () => {
    expect(parseJsonArray('{"key": "value"}')).toEqual([])
  })

  it('数値配列も文字列に変換する', () => {
    expect(parseJsonArray('[1, 2, 3]')).toEqual(['1', '2', '3'])
  })
})

describe('valueMatches', () => {
  describe('基本的なマッチング', () => {
    it('完全一致（exact mode）', () => {
      expect(valueMatches('青眼の白龍', '青眼の白龍', 'exact')).toBe(true)
      expect(valueMatches('青眼の白龍', '青眼', 'exact')).toBe(false)
    })

    it('部分一致（partial mode）', () => {
      expect(valueMatches('青眼の白龍', '青眼', 'partial')).toBe(true)
      expect(valueMatches('青眼の白龍', 'ブラマジ', 'partial')).toBe(false)
    })

    it('null/undefined パターンは常に true', () => {
      expect(valueMatches('青眼の白龍', null, 'exact')).toBe(true)
      expect(valueMatches('青眼の白龍', undefined, 'exact')).toBe(true)
    })
  })

  describe('正規化モード（flagAutoModify）', () => {
    it('正規化を適用してマッチング', () => {
      expect(valueMatches('青眼の白龍', '青眼　の　白龍', 'exact', true, true)).toBe(true)
      expect(valueMatches('E・HERO', 'ehero', 'exact', true, true)).toBe(true)
    })

    it('事前正規化された値を使用', () => {
      const normalized = normalizeForSearch('青眼の白龍')
      expect(valueMatches('青眼の白龍', '青眼の白龍', 'exact', true, true, normalized)).toBe(true)
    })
  })

  describe('ワイルドカードマッチング', () => {
    it('ワイルドカードを使用したマッチング', () => {
      expect(valueMatches('青眼の白龍', '青眼*', 'exact', false, true, undefined, true)).toBe(true)
      expect(valueMatches('青眼の白龍', '*白龍', 'exact', false, true, undefined, true)).toBe(true)
      expect(valueMatches('青眼の白龍', '青*龍', 'exact', false, true, undefined, true)).toBe(true)
    })

    it('ワイルドカード + 正規化', () => {
      expect(valueMatches('E・HERO フレイム・ウィングマン', 'ehero*', 'exact', true, true, undefined, true)).toBe(true)
    })
  })

  describe('ネガティブパターン', () => {
    it('ネガティブパターンにマッチする場合は除外', () => {
      expect(valueMatches('ドラゴン族の効果モンスター', 'ドラゴン -"効果"', 'exact', false, false, undefined, false, true)).toBe(false)
    })

    it('ネガティブパターンにマッチしない場合は通過', () => {
      expect(valueMatches('ドラゴン族の通常モンスター', 'ドラゴン -"効果"', 'exact', false, false, undefined, false, true)).toBe(true)
    })

    it('ネガティブパターンのみの場合', () => {
      expect(valueMatches('ドラゴン族の効果モンスター', ' -"効果"', 'exact', false, false, undefined, false, true)).toBe(false)
      expect(valueMatches('ドラゴン族の通常モンスター', ' -"効果"', 'exact', false, false, undefined, false, true)).toBe(true)
    })
  })

  describe('ファジーマッチング', () => {
    it('ファジーマッチングを使用', () => {
      expect(valueMatches('青眼の白龍', '青眼の白竜', 'exact', true, true, undefined, false, false, true)).toBe(true)
    })

    it('距離が閾値を超える場合はマッチしない', () => {
      expect(valueMatches('abc', 'xyz', 'exact', false, true, undefined, false, false, true)).toBe(false)
    })
  })

  describe('JSON 配列フィールド', () => {
    it('配列内の要素にマッチする', () => {
      expect(valueMatches('["効果", "チューナー"]', '効果', 'exact', false, false, undefined, false, false, false, 'monsterTypes')).toBe(true)
      expect(valueMatches('["効果", "チューナー"]', 'チューナー', 'exact', false, false, undefined, false, false, false, 'monsterTypes')).toBe(true)
    })

    it('配列内に存在しない要素はマッチしない', () => {
      expect(valueMatches('["効果", "チューナー"]', '儀式', 'exact', false, false, undefined, false, false, false, 'monsterTypes')).toBe(false)
    })
  })

  describe('テキストフィールド', () => {
    it('テキストフィールドは常に部分一致', () => {
      expect(valueMatches('このカードが召喚に成功した時', '召喚', 'exact', false, false, undefined, false, true)).toBe(true)
      expect(valueMatches('このカードが召喚に成功した時', '成功', 'exact', false, false, undefined, false, true)).toBe(true)
    })
  })
})
