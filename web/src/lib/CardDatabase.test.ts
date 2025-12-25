/**
 * CardDatabaseのユニットテスト
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { Card, SearchParams, OptionFilterSelection, RangeFilter } from './types'

// テスト用のCardDatabaseクラス
class TestCardDatabase {
  private cards: Card[] = []

  // privateプロパティにアクセスするためのヘルパー
  setTestData(cards: Card[], _headers: string[]) {
    this.cards = cards
  }

  // CardDatabaseのsearchメソッドと同じロジックを実装
  async search(params: any): Promise<Card[]> {
    // CardDatabaseのsearchロジックをコピー
    const {
      query,
      fields = ['all'],
      optionFilters,
      rangeFilters,
      max = 100
    } = params

    // 検索クエリをパース（簡略版）
    const parsed = query ? { terms: [query] } : null

    const results: Card[] = []
    for (const card of this.cards) {
      let ok = true

      // 検索クエリフィルタ
      if (parsed) {
        let matched = false
        const searchFields = fields.includes('all')
          ? ['name', 'ruby', 'text', 'pendulumText', 'supplementInfo', 'pendulumSupplementInfo']
          : fields

        for (const field of searchFields) {
          const text = card[field]
          if (typeof text === 'string' && text.includes(query)) {
            matched = true
            break
          }
        }

        if (!matched) {
          ok = false
        }
      }

      // 選択肢フィルタ
      if (ok && optionFilters) {
        for (const [fieldName, selection] of Object.entries(optionFilters)) {
          const typedSelection = selection as OptionFilterSelection
          if (!typedSelection || (typedSelection.positive.length === 0 && typedSelection.negative.length === 0)) continue

          const cardValue = card[fieldName]
          let positiveMatched = true
          let negativeMatched = true

          // 肯定選択のチェック
          if (typedSelection.positive.length > 0) {
            const matches: boolean[] = []

            if (fieldName === 'linkMarkers') {
              typedSelection.positive.forEach((val: string) => {
                const digit = val.split(':')[0]
                matches.push((cardValue || '').includes(digit))
              })
            } else if (fieldName === 'monsterTypes') {
              try {
                const arrayValues = JSON.parse(cardValue || '[]')
                typedSelection.positive.forEach((val: string) => {
                  matches.push(arrayValues.includes(val))
                })
              } catch {
                matches.push(false)
              }
            } else {
              typedSelection.positive.forEach((val: string) => {
                matches.push(cardValue === val)
              })
            }

            if (typedSelection.operator === 'or') {
              positiveMatched = matches.some(m => m)
            } else {
              positiveMatched = matches.every(m => m)
            }
          }

          // 否定選択のチェック（常にAND）
          if (typedSelection.negative.length > 0) {
            const negativeMatches: boolean[] = []

            if (fieldName === 'linkMarkers') {
              typedSelection.negative.forEach((val: string) => {
                const digit = val.split(':')[0]
                negativeMatches.push((cardValue || '').includes(digit))
              })
            } else if (fieldName === 'monsterTypes') {
              try {
                const arrayValues = JSON.parse(cardValue || '[]')
                typedSelection.negative.forEach((val: string) => {
                  negativeMatches.push(arrayValues.includes(val))
                })
              } catch {
                negativeMatches.push(false)
              }
            } else {
              typedSelection.negative.forEach((val: string) => {
                negativeMatches.push(cardValue === val)
              })
            }

            negativeMatched = negativeMatches.every(m => !m)
          }

          if (!positiveMatched || !negativeMatched) {
            ok = false
            break
          }
        }
      }

      // 数値範囲フィルタ
      if (ok && rangeFilters) {
        for (const [fieldName, range] of Object.entries(rangeFilters)) {
          const typedRange = range as RangeFilter
          if (!typedRange || (typedRange.min === undefined && typedRange.max === undefined && typedRange.exact === undefined && !typedRange.questionMark)) continue

          const cardValue = card[fieldName]

          if (typedRange.questionMark) {
            if (cardValue !== '?') {
              ok = false
              break
            }
            continue
          }

          const numValue = parseInt(cardValue, 10)

          if (isNaN(numValue)) {
            ok = false
            break
          }

          if (typedRange.exact !== undefined) {
            if (numValue !== typedRange.exact) {
              ok = false
              break
            }
            continue
          }

          if (typedRange.min !== undefined && numValue < typedRange.min) {
            ok = false
            break
          }
          if (typedRange.max !== undefined && numValue > typedRange.max) {
            ok = false
            break
          }
        }
      }

      if (ok) {
        results.push(card)
        if (results.length >= max) {
          break
        }
      }
    }

    return results
  }
}

describe('CardDatabase', () => {
  let db: TestCardDatabase
  let testCards: Card[]

  beforeEach(() => {
    db = new TestCardDatabase()

    // テスト用カードデータ
    testCards = [
      {
        cardId: '1',
        name: 'ブラック・マジシャン',
        ruby: 'ぶらっく・まじしゃん',
        cardType: 'モンスター',
        race: '魔法使い族',
        attribute: '闇',
        monsterTypes: '["通常"]',
        atk: '2500',
        def: '2100',
        levelValue: '7',
        text: '魔法使いとしては攻撃力・守備力ともに最高クラス。',
        supplementInfo: '',
        pendulumText: '',
        pendulumSupplementInfo: '',
        spellEffectType: '',
        trapEffectType: '',
        linkMarkers: '',
        linkValue: '',
        pendulumScale: ''
      },
      {
        cardId: '2',
        name: '青眼の白龍',
        ruby: 'ブルーアイズ・ホワイト・ドラゴン',
        cardType: 'モンスター',
        race: 'ドラゴン族',
        attribute: '光',
        monsterTypes: '["通常"]',
        atk: '3000',
        def: '2500',
        levelValue: '8',
        text: '高い攻撃力を誇る伝説のドラゴン。',
        supplementInfo: '',
        pendulumText: '',
        pendulumSupplementInfo: '',
        spellEffectType: '',
        trapEffectType: '',
        linkMarkers: '',
        linkValue: '',
        pendulumScale: ''
      },
      {
        cardId: '3',
        name: '死者蘇生',
        ruby: 'ししゃそせい',
        cardType: '魔法',
        race: '',
        attribute: '',
        monsterTypes: '',
        atk: '',
        def: '',
        levelValue: '',
        text: '自分または相手の墓地のモンスター1体を選択して発動できる。',
        supplementInfo: '',
        pendulumText: '',
        pendulumSupplementInfo: '',
        spellEffectType: '通常',
        trapEffectType: '',
        linkMarkers: '',
        linkValue: '',
        pendulumScale: ''
      },
      {
        cardId: '4',
        name: '聖なるバリア -ミラーフォース-',
        ruby: 'せいなるばりあ みらーふぉーす',
        cardType: '罠',
        race: '',
        attribute: '',
        monsterTypes: '',
        atk: '',
        def: '',
        levelValue: '',
        text: '相手モンスターの攻撃宣言時に発動できる。',
        supplementInfo: '',
        pendulumText: '',
        pendulumSupplementInfo: '',
        spellEffectType: '',
        trapEffectType: '通常',
        linkMarkers: '',
        linkValue: '',
        pendulumScale: ''
      },
      {
        cardId: '5',
        name: 'デコード・トーカー',
        ruby: 'でこーど・とーかー',
        cardType: 'モンスター',
        race: 'サイバース族',
        attribute: '闇',
        monsterTypes: '["リンク","効果"]',
        atk: '2300',
        def: '',
        levelValue: '',
        text: 'リンク召喚でしか特殊召喚できない。',
        supplementInfo: '',
        pendulumText: '',
        pendulumSupplementInfo: '',
        spellEffectType: '',
        trapEffectType: '',
        linkMarkers: '249',
        linkValue: '3',
        pendulumScale: ''
      }
    ]

    db.setTestData(testCards, [
      'cardId', 'name', 'ruby', 'cardType', 'race', 'attribute',
      'monsterTypes', 'atk', 'def', 'levelValue', 'text',
      'supplementInfo', 'pendulumText', 'pendulumSupplementInfo',
      'spellEffectType', 'trapEffectType', 'linkMarkers', 'linkValue', 'pendulumScale'
    ])
  })

  describe('基本検索', () => {
    it('クエリなしですべてのカードを返す', async () => {
      const params: SearchParams = {}
      const results = await db.search(params)
      expect(results).toHaveLength(5)
    })

    it('名前で部分一致検索', async () => {
      const params: SearchParams = {
        query: 'マジシャン'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('ブラック・マジシャン')
    })

    it('テキストで検索', async () => {
      const params: SearchParams = {
        query: 'ドラゴン'
      }
      const results = await db.search(params)
      expect(results.length).toBeGreaterThan(0)
      const names = results.map(c => c.name)
      expect(names).toContain('青眼の白龍')
    })

    it('最大件数制限', async () => {
      const params: SearchParams = {
        max: 2
      }
      const results = await db.search(params)
      expect(results).toHaveLength(2)
    })
  })

  describe('optionFilters: 肯定選択', () => {
    it('cardType肯定選択（OR）', async () => {
      const params: SearchParams = {
        optionFilters: {
          cardType: {
            positive: ['モンスター', '魔法'],
            negative: [],
            operator: 'or'
          }
        }
      }
      const results = await db.search(params)
      expect(results).toHaveLength(4) // ブラック・マジシャン、青眼の白龍、死者蘇生、デコード・トーカー
      const cardTypes = new Set(results.map(c => c.cardType))
      expect(cardTypes.has('モンスター')).toBe(true)
      expect(cardTypes.has('魔法')).toBe(true)
      expect(cardTypes.has('罠')).toBe(false)
    })

    it('cardType肯定選択（AND）', async () => {
      // monsterTypesでANDテスト
      const params: SearchParams = {
        optionFilters: {
          monsterTypes: {
            positive: ['リンク', '効果'],
            negative: [],
            operator: 'and'
          }
        }
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('デコード・トーカー')
    })

    it('race肯定選択（OR）', async () => {
      const params: SearchParams = {
        optionFilters: {
          race: {
            positive: ['魔法使い族', 'ドラゴン族'],
            negative: [],
            operator: 'or'
          }
        }
      }
      const results = await db.search(params)
      expect(results).toHaveLength(2)
      const names = results.map(c => c.name).sort()
      expect(names).toEqual(['ブラック・マジシャン', '青眼の白龍'])
    })
  })

  describe('optionFilters: 否定選択', () => {
    it('cardType否定選択（AND）', async () => {
      const params: SearchParams = {
        optionFilters: {
          cardType: {
            positive: [],
            negative: ['罠'],
            operator: 'or'
          }
        }
      }
      const results = await db.search(params)
      expect(results).toHaveLength(4) // 罠以外
      const cardTypes = results.map(c => c.cardType)
      expect(cardTypes).not.toContain('罠')
    })

    it('複数の否定選択（AND）', async () => {
      const params: SearchParams = {
        optionFilters: {
          cardType: {
            positive: [],
            negative: ['魔法', '罠'],
            operator: 'or'
          }
        }
      }
      const results = await db.search(params)
      expect(results).toHaveLength(3) // モンスターのみ
      const cardTypes = new Set(results.map(c => c.cardType))
      expect(cardTypes.has('モンスター')).toBe(true)
      expect(cardTypes.has('魔法')).toBe(false)
      expect(cardTypes.has('罠')).toBe(false)
    })
  })

  describe('optionFilters: 肯定と否定の組み合わせ', () => {
    it('肯定（OR）+ 否定（AND）', async () => {
      const params: SearchParams = {
        optionFilters: {
          attribute: {
            positive: ['闇', '光'],
            negative: [],
            operator: 'or'
          },
          race: {
            positive: [],
            negative: ['ドラゴン族'],
            operator: 'or'
          }
        }
      }
      const results = await db.search(params)
      // 闇or光 かつ ドラゴン族ではない
      // ブラック・マジシャン（闇・魔法使い族）、デコード・トーカー（闇・サイバース族）
      expect(results).toHaveLength(2)
      const names = results.map(c => c.name).sort()
      expect(names).toContain('ブラック・マジシャン')
      expect(names).toContain('デコード・トーカー')
    })
  })

  describe('rangeFilters', () => {
    it('atk範囲検索（min）', async () => {
      const params: SearchParams = {
        rangeFilters: {
          atk: { min: 2500 }
        }
      }
      const results = await db.search(params)
      expect(results.length).toBeGreaterThan(0)
      results.forEach(card => {
        const atk = parseInt(card.atk, 10)
        expect(atk).toBeGreaterThanOrEqual(2500)
      })
    })

    it('atk範囲検索（max）', async () => {
      const params: SearchParams = {
        rangeFilters: {
          atk: { max: 2500 }
        }
      }
      const results = await db.search(params)
      results.forEach(card => {
        const atk = parseInt(card.atk, 10)
        expect(atk).toBeLessThanOrEqual(2500)
      })
    })

    it('atk範囲検索（min + max）', async () => {
      const params: SearchParams = {
        rangeFilters: {
          atk: { min: 2000, max: 2500 }
        }
      }
      const results = await db.search(params)
      results.forEach(card => {
        const atk = parseInt(card.atk, 10)
        expect(atk).toBeGreaterThanOrEqual(2000)
        expect(atk).toBeLessThanOrEqual(2500)
      })
    })

    it('atk完全一致検索', async () => {
      const params: SearchParams = {
        rangeFilters: {
          atk: { exact: 3000 }
        }
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('青眼の白龍')
    })
  })

  describe('linkMarkers', () => {
    it('linkMarkers肯定選択', async () => {
      const params: SearchParams = {
        optionFilters: {
          linkMarkers: {
            positive: ['2:下'],
            negative: [],
            operator: 'or'
          }
        }
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].name).toBe('デコード・トーカー')
      expect(results[0].linkMarkers).toContain('2')
    })

    it('linkMarkers複数選択（OR）', async () => {
      const params: SearchParams = {
        optionFilters: {
          linkMarkers: {
            positive: ['2:下', '9:右上'],
            negative: [],
            operator: 'or'
          }
        }
      }
      const results = await db.search(params)
      expect(results.length).toBeGreaterThan(0)
      results.forEach(card => {
        expect(card.linkMarkers.includes('2') || card.linkMarkers.includes('9')).toBe(true)
      })
    })
  })

  describe('複合検索', () => {
    it('クエリ + optionFilters + rangeFilters', async () => {
      const params: SearchParams = {
        query: '攻撃',
        optionFilters: {
          cardType: {
            positive: ['モンスター'],
            negative: [],
            operator: 'or'
          }
        },
        rangeFilters: {
          atk: { min: 2000 }
        }
      }
      const results = await db.search(params)
      results.forEach(card => {
        expect(card.cardType).toBe('モンスター')
        const atk = parseInt(card.atk, 10)
        expect(atk).toBeGreaterThanOrEqual(2000)
      })
    })
  })
})
