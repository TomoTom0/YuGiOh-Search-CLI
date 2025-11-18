import { describe, it, expect } from 'vitest'
import { MOCK_CARD_DATA, getMockCardById, getMockCardsByName, getMockCardsByPattern } from '../fixtures/mock-data'

describe('Mock Data Helpers (Unit)', () => {
  describe('getMockCardById', () => {
    it('should find card by ID', () => {
      const card = getMockCardById('4007')
      expect(card).toBeDefined()
      expect(card?.name).toBe('青眼の白龍')
    })

    it('should return undefined for non-existent ID', () => {
      const card = getMockCardById('99999')
      expect(card).toBeUndefined()
    })
  })

  describe('getMockCardsByName', () => {
    it('should find card by exact name', () => {
      const cards = getMockCardsByName('青眼の白龍', true)
      expect(cards).toHaveLength(2) // Two versions of Blue-Eyes
      expect(cards.every(c => c.name === '青眼の白龍')).toBe(true)
    })

    it('should find cards by partial name', () => {
      const cards = getMockCardsByName('青眼', false)
      expect(cards.length).toBeGreaterThan(0)
      expect(cards.every(c => c.name.includes('青眼'))).toBe(true)
    })

    it('should return empty array for non-existent card', () => {
      const cards = getMockCardsByName('NonExistent', true)
      expect(cards).toHaveLength(0)
    })
  })

  describe('getMockCardsByPattern', () => {
    it('should find cards with wildcard pattern', () => {
      const cards = getMockCardsByPattern('ブルーアイズ*')
      expect(cards.length).toBeGreaterThan(0)
      expect(cards.some(c => c.ruby.startsWith('ブルーアイズ'))).toBe(true)
    })

    it('should find cards with complex pattern', () => {
      const cards = getMockCardsByPattern('Evil*Twin*')
      expect(cards.length).toBeGreaterThan(0)
      expect(cards.some(c => c.name.includes('Evil'))).toBe(true)
    })

    it('should return empty for non-matching pattern', () => {
      const cards = getMockCardsByPattern('NonExistent*')
      expect(cards).toHaveLength(0)
    })
  })

  describe('Mock Data Structure', () => {
    it('should have correct card structure', () => {
      const card = MOCK_CARD_DATA[0]
      expect(card).toHaveProperty('cardId')
      expect(card).toHaveProperty('name')
      expect(card).toHaveProperty('ruby')
      expect(card).toHaveProperty('cardType')
    })

    it('should include monster cards', () => {
      const monsters = MOCK_CARD_DATA.filter(c => c.cardType === 'monster')
      expect(monsters.length).toBeGreaterThan(0)
    })

    it('should include spell cards', () => {
      const spells = MOCK_CARD_DATA.filter(c => c.cardType === 'spell')
      expect(spells.length).toBeGreaterThan(0)
    })

    it('should include trap cards', () => {
      const traps = MOCK_CARD_DATA.filter(c => c.cardType === 'trap')
      expect(traps.length).toBeGreaterThan(0)
    })

    it('should have cards with different attributes', () => {
      const attributes = new Set(MOCK_CARD_DATA.filter(c => c.cardType === 'monster').map(c => c.attribute))
      expect(attributes.size).toBeGreaterThan(1)
    })
  })
})
