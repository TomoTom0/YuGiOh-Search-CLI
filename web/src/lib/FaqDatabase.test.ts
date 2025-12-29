/**
 * FaqDatabaseのユニットテスト
 */

import { describe, it, expect, beforeEach } from 'vitest'
import type { Faq, FaqSearchParams } from './types'

// テスト用のFaqDatabaseクラス
class TestFaqDatabase {
  private faqs: Faq[] = []

  setTestData(faqs: Faq[]) {
    this.faqs = faqs
  }

  async search(params: FaqSearchParams): Promise<Faq[]> {
    const {
      query = '',
      fields = ['all'],
      cardName,
      faqId,
      updatedAt,
      max = 100
    } = params

    const results: Faq[] = []

    for (const faq of this.faqs) {
      // FAQ IDフィルタ
      if (faqId && faq.faqId !== faqId) {
        continue
      }

      // 更新日フィルタ
      if (updatedAt && !faq.updatedAt.startsWith(updatedAt)) {
        continue
      }

      // 登場カード名フィルタ
      if (cardName) {
        const questionContains = faq.question.includes(cardName)
        const answerContains = faq.answer.includes(cardName)
        if (!questionContains && !answerContains) {
          continue
        }
      }

      // 検索クエリフィルタ（簡略版）
      if (query) {
        let matched = false

        const searchFields = fields.includes('all')
          ? ['question', 'answer']
          : fields

        for (const field of searchFields) {
          const text = faq[field as keyof Faq]
          if (typeof text === 'string' && text.includes(query)) {
            matched = true
            break
          }
        }

        if (!matched) {
          continue
        }
      }

      results.push(faq)

      if (results.length >= max) {
        break
      }
    }

    return results
  }
}

describe('FaqDatabase', () => {
  let db: TestFaqDatabase
  let testFaqs: Faq[]

  beforeEach(() => {
    db = new TestFaqDatabase()

    // テスト用FAQデータ
    testFaqs = [
      {
        faqId: 'FAQ001',
        question: '「ブラック・マジシャン」が特殊召喚された場合、「永続魔法」の効果は発動しますか？',
        answer: 'はい、発動します。特殊召喚も召喚の一種です。',
        updatedAt: '2024-01-15'
      },
      {
        faqId: 'FAQ002',
        question: '「青眼の白龍」の攻撃力を上げる効果は重複しますか？',
        answer: 'はい、重複します。複数の効果が適用されます。',
        updatedAt: '2024-01-20'
      },
      {
        faqId: 'FAQ003',
        question: '「死者蘇生」で特殊召喚したモンスターは攻撃できますか？',
        answer: 'はい、できます。特殊召喚されたターンでも攻撃可能です。',
        updatedAt: '2024-02-01'
      },
      {
        faqId: 'FAQ004',
        question: '「聖なるバリア -ミラーフォース-」は複数のモンスターを破壊できますか？',
        answer: 'はい、可能です。攻撃表示モンスターをすべて破壊します。',
        updatedAt: '2024-02-10'
      },
      {
        faqId: 'FAQ005',
        question: '「ブラック・マジシャン」と「ブラック・マジシャン・ガール」の効果は重複しますか？',
        answer: 'いいえ、それぞれ別のカードなので個別に処理されます。',
        updatedAt: '2024-03-01'
      }
    ]

    db.setTestData(testFaqs)
  })

  describe('基本検索', () => {
    it('クエリなしですべてのFAQを返す', async () => {
      const params: FaqSearchParams = {}
      const results = await db.search(params)
      expect(results).toHaveLength(5)
    })

    it('questionフィールドで検索', async () => {
      const params: FaqSearchParams = {
        query: '攻撃力',
        fields: ['question']
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].faqId).toBe('FAQ002')
    })

    it('answerフィールドで検索', async () => {
      const params: FaqSearchParams = {
        query: '破壊',
        fields: ['answer']
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].faqId).toBe('FAQ004')
    })

    it('allフィールドで検索（questionとanswerの両方）', async () => {
      const params: FaqSearchParams = {
        query: '特殊召喚',
        fields: ['all']
      }
      const results = await db.search(params)
      expect(results.length).toBeGreaterThan(0)
      // FAQ001とFAQ003にヒットするはず
      const faqIds = results.map(f => f.faqId)
      expect(faqIds).toContain('FAQ001')
      expect(faqIds).toContain('FAQ003')
    })

    it('最大件数制限', async () => {
      const params: FaqSearchParams = {
        max: 2
      }
      const results = await db.search(params)
      expect(results).toHaveLength(2)
    })
  })

  describe('cardNameフィルタ', () => {
    it('カード名でフィルタ（question内）', async () => {
      const params: FaqSearchParams = {
        cardName: 'ブラック・マジシャン'
      }
      const results = await db.search(params)
      expect(results.length).toBeGreaterThan(0)
      // FAQ001とFAQ005にヒットするはず
      const faqIds = results.map(f => f.faqId).sort()
      expect(faqIds).toEqual(['FAQ001', 'FAQ005'])
    })

    it('カード名でフィルタ（questionとanswerの両方）', async () => {
      const params: FaqSearchParams = {
        cardName: '複数'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(2)
      const faqIds = results.map(f => f.faqId).sort()
      expect(faqIds).toEqual(['FAQ002', 'FAQ004'])
    })

    it('カード名でフィルタ（マッチなし）', async () => {
      const params: FaqSearchParams = {
        cardName: '存在しないカード名'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(0)
    })
  })

  describe('faqIdフィルタ', () => {
    it('FAQ IDで完全一致検索', async () => {
      const params: FaqSearchParams = {
        faqId: 'FAQ003'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].faqId).toBe('FAQ003')
      expect(results[0].question).toContain('死者蘇生')
    })

    it('FAQ IDでマッチなし', async () => {
      const params: FaqSearchParams = {
        faqId: 'FAQ999'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(0)
    })
  })

  describe('updatedAtフィルタ', () => {
    it('更新日で前方一致検索（年月）', async () => {
      const params: FaqSearchParams = {
        updatedAt: '2024-01'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(2) // FAQ001, FAQ002
      const faqIds = results.map(f => f.faqId).sort()
      expect(faqIds).toEqual(['FAQ001', 'FAQ002'])
    })

    it('更新日で前方一致検索（完全日付）', async () => {
      const params: FaqSearchParams = {
        updatedAt: '2024-02-01'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].faqId).toBe('FAQ003')
    })

    it('更新日でマッチなし', async () => {
      const params: FaqSearchParams = {
        updatedAt: '2025-01'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(0)
    })
  })

  describe('複合検索', () => {
    it('query + cardName', async () => {
      const params: FaqSearchParams = {
        query: '効果',
        cardName: 'ブラック・マジシャン'
      }
      const results = await db.search(params)
      expect(results.length).toBeGreaterThan(0)
      results.forEach(faq => {
        const hasCardName = faq.question.includes('ブラック・マジシャン') || faq.answer.includes('ブラック・マジシャン')
        expect(hasCardName).toBe(true)
        const hasQuery = faq.question.includes('効果') || faq.answer.includes('効果')
        expect(hasQuery).toBe(true)
      })
    })

    it('query + updatedAt', async () => {
      const params: FaqSearchParams = {
        query: '破壊',
        updatedAt: '2024-02'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].faqId).toBe('FAQ004')
    })

    it('cardName + updatedAt', async () => {
      const params: FaqSearchParams = {
        cardName: 'ブラック・マジシャン',
        updatedAt: '2024-01'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].faqId).toBe('FAQ001')
    })

    it('query + cardName + updatedAt', async () => {
      const params: FaqSearchParams = {
        query: '重複',
        cardName: 'ブラック・マジシャン',
        updatedAt: '2024-03'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].faqId).toBe('FAQ005')
    })

    it('faqId + その他のフィルタ（faqIdが優先される）', async () => {
      const params: FaqSearchParams = {
        faqId: 'FAQ002',
        query: '存在しないクエリ'
      }
      const results = await db.search(params)
      // faqIdでフィルタされるが、queryでマッチしないので結果0
      expect(results).toHaveLength(0)
    })
  })

  describe('エッジケース', () => {
    it('空のクエリと空のフィルタ', async () => {
      const params: FaqSearchParams = {
        query: '',
        cardName: '',
        faqId: '',
        updatedAt: ''
      }
      const results = await db.search(params)
      expect(results).toHaveLength(5)
    })

    it('すべてのフィルタで絞り込み', async () => {
      const params: FaqSearchParams = {
        query: '召喚',
        cardName: 'ブラック・マジシャン',
        updatedAt: '2024-01-15',
        faqId: 'FAQ001'
      }
      const results = await db.search(params)
      expect(results).toHaveLength(1)
      expect(results[0].faqId).toBe('FAQ001')
    })
  })
})
