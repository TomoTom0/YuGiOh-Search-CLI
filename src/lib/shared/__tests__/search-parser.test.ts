import { describe, it, expect } from 'vitest'
import { parseSearchQuery, matchParsedQuery } from '../search-parser.js'

describe('parseSearchQuery', () => {
  describe('マイナス検索', () => {
    it('単語のマイナス検索をパースする', () => {
      const result = parseSearchQuery('青眼 -儀式')
      expect(result.positive).toEqual(['青眼'])
      expect(result.negative).toEqual(['儀式'])
      expect(result.phrases).toEqual([])
      expect(result.regexes).toEqual([])
    })

    it('フレーズのマイナス検索をパースする', () => {
      const result = parseSearchQuery('青眼 -"儀式"')
      expect(result.positive).toEqual(['青眼'])
      expect(result.negative).toEqual(['儀式'])
      expect(result.phrases).toEqual([])
      expect(result.regexes).toEqual([])
    })

    it('複数のマイナス検索をパースする', () => {
      const result = parseSearchQuery('ドラゴン -儀式 -"融合"')
      expect(result.positive).toEqual(['ドラゴン'])
      expect(result.negative).toEqual(['儀式', '融合'])
      expect(result.phrases).toEqual([])
      expect(result.regexes).toEqual([])
    })
  })

  describe('フレーズ検索', () => {
    it('フレーズ検索をパースする', () => {
      const result = parseSearchQuery('"ブラック・マジシャン"')
      expect(result.positive).toEqual([])
      expect(result.negative).toEqual([])
      expect(result.phrases).toEqual(['ブラック・マジシャン'])
      expect(result.regexes).toEqual([])
    })

    it('複数のフレーズ検索をパースする', () => {
      const result = parseSearchQuery('"ブラック・マジシャン" "青眼の白龍"')
      expect(result.positive).toEqual([])
      expect(result.negative).toEqual([])
      expect(result.phrases).toEqual(['ブラック・マジシャン', '青眼の白龍'])
      expect(result.regexes).toEqual([])
    })

    it('フレーズと通常検索の組み合わせ', () => {
      const result = parseSearchQuery('ドラゴン "青眼の白龍"')
      expect(result.positive).toEqual(['ドラゴン'])
      expect(result.negative).toEqual([])
      expect(result.phrases).toEqual(['青眼の白龍'])
      expect(result.regexes).toEqual([])
    })
  })

  describe('正規表現検索', () => {
    it('正規表現検索をパースする', () => {
      const result = parseSearchQuery('reg:青眼.*')
      expect(result.positive).toEqual([])
      expect(result.negative).toEqual([])
      expect(result.phrases).toEqual([])
      expect(result.regexes).toEqual(['青眼.*'])
    })

    it('ダブルクォート付き正規表現検索をパースする', () => {
      const result = parseSearchQuery('reg:"ブラック.*"')
      expect(result.positive).toEqual([])
      expect(result.negative).toEqual([])
      expect(result.phrases).toEqual([])
      expect(result.regexes).toEqual(['ブラック.*'])
    })

    it('複数の正規表現検索をパースする', () => {
      const result = parseSearchQuery('reg:青眼.* reg:".*マジシャン"')
      expect(result.positive).toEqual([])
      expect(result.negative).toEqual([])
      expect(result.phrases).toEqual([])
      expect(result.regexes).toEqual(['青眼.*', '.*マジシャン'])
    })
  })

  describe('複合検索', () => {
    it('すべての検索タイプを組み合わせる', () => {
      const result = parseSearchQuery('ドラゴン -儀式 -"融合" "青眼の白龍" reg:.*マジシャン')
      expect(result.positive).toEqual(['ドラゴン'])
      expect(result.negative).toEqual(['儀式', '融合'])
      expect(result.phrases).toEqual(['青眼の白龍'])
      expect(result.regexes).toEqual(['.*マジシャン'])
    })

    it('複雑な組み合わせ', () => {
      const result = parseSearchQuery('効果 通常 -"儀式" -融合 "ブラック・マジシャン" reg:^青眼')
      expect(result.positive).toEqual(['効果', '通常'])
      expect(result.negative).toEqual(['儀式', '融合'])
      expect(result.phrases).toEqual(['ブラック・マジシャン'])
      expect(result.regexes).toEqual(['^青眼'])
    })
  })

  describe('エッジケース', () => {
    it('空文字列を処理する', () => {
      const result = parseSearchQuery('')
      expect(result.positive).toEqual([])
      expect(result.negative).toEqual([])
      expect(result.phrases).toEqual([])
      expect(result.regexes).toEqual([])
    })

    it('空白のみを処理する', () => {
      const result = parseSearchQuery('   ')
      expect(result.positive).toEqual([])
      expect(result.negative).toEqual([])
      expect(result.phrases).toEqual([])
      expect(result.regexes).toEqual([])
    })

    it('マイナス記号のみを無視する', () => {
      const result = parseSearchQuery('青眼 - 白龍')
      expect(result.positive).toEqual(['青眼', '白龍'])
    })
  })
})

describe('matchParsedQuery', () => {
  describe('ポジティブ検索', () => {
    it('すべての単語がマッチする', () => {
      const parsed = parseSearchQuery('青眼 白龍')
      expect(matchParsedQuery('青眼の白龍', parsed)).toBe(true)
    })

    it('一部の単語が欠けている場合はマッチしない', () => {
      const parsed = parseSearchQuery('青眼 白龍')
      expect(matchParsedQuery('青眼のドラゴン', parsed)).toBe(false)
    })
  })

  describe('ネガティブ検索', () => {
    it('除外ワードが含まれない場合マッチする', () => {
      const parsed = parseSearchQuery('ドラゴン -儀式')
      expect(matchParsedQuery('ドラゴン族の効果モンスター', parsed)).toBe(true)
    })

    it('除外ワードが含まれる場合マッチしない', () => {
      const parsed = parseSearchQuery('ドラゴン -儀式')
      expect(matchParsedQuery('ドラゴン族の儀式モンスター', parsed)).toBe(false)
    })
  })

  describe('フレーズ検索', () => {
    it('フレーズ全体がマッチする', () => {
      const parsed = parseSearchQuery('"青眼の白龍"')
      expect(matchParsedQuery('これは青眼の白龍です', parsed)).toBe(true)
    })

    it('フレーズが分割されている場合マッチしない', () => {
      const parsed = parseSearchQuery('"青眼の白龍"')
      expect(matchParsedQuery('青眼 白龍', parsed)).toBe(false)
    })
  })

  describe('正規表現検索', () => {
    it('正規表現にマッチする', () => {
      const parsed = parseSearchQuery('reg:青眼.*')
      expect(matchParsedQuery('青眼の白龍', parsed)).toBe(true)
      expect(matchParsedQuery('青眼の究極竜', parsed)).toBe(true)
    })

    it('正規表現にマッチしない', () => {
      const parsed = parseSearchQuery('reg:青眼.*')
      expect(matchParsedQuery('ブラック・マジシャン', parsed)).toBe(false)
    })

    it('無効な正規表現の場合はマッチしない', () => {
      const parsed = parseSearchQuery('reg:[invalid(')
      expect(matchParsedQuery('any text', parsed)).toBe(false)
    })
  })

  describe('複合検索のマッチング', () => {
    it('すべての条件を満たす場合マッチする', () => {
      const parsed = parseSearchQuery('ドラゴン -儀式 "青眼" reg:.*白龍')
      expect(matchParsedQuery('ドラゴン族の青眼の白龍', parsed)).toBe(true)
    })

    it('ネガティブ条件で除外される', () => {
      const parsed = parseSearchQuery('ドラゴン -儀式 "青眼"')
      expect(matchParsedQuery('ドラゴン族の青眼の儀式', parsed)).toBe(false)
    })

    it('フレーズが欠けている場合マッチしない', () => {
      const parsed = parseSearchQuery('ドラゴン "青眼の白龍"')
      expect(matchParsedQuery('ドラゴン族の青眼', parsed)).toBe(false)
    })
  })
})
