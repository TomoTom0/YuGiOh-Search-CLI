import { describe, it, expect } from 'vitest'
import { convertCardToVectorRecord } from '../../src/lib/vector/converter.js'
import type { CardRow } from '../../src/lib/vector/converter.js'

// CardRow の全フィールドが string のため、未設定フィールドは空文字で埋めるヘルパ
function makeSpellCard(spellEffectType: string): CardRow {
  const base: CardRow = {
    cardType: 'spell',
    name: 'テスト魔法',
    nameModified: '',
    ruby: '',
    cardId: '99999',
    ciid: '',
    imgs: '',
    text: '',
    biko: '',
    isNotLegalForOfficial: '',
    attribute: '',
    levelType: '',
    levelValue: '',
    race: '',
    monsterTypes: '',
    atk: '',
    def: '',
    linkMarkers: '',
    pendulumScale: '',
    pendulumText: '',
    isExtraDeck: '',
    spellEffectType,
    trapEffectType: '',
  }
  return base
}

describe('convertCardToVectorRecord - SpellEffectType 日本語化', () => {
  it('速攻魔法(spellEffectType="quick")は「速攻魔法」に変換される', () => {
    // M0-T3 仕様確定: SpellEffectType は 'quick' に統一。
    // converter.ts の旧キー 'quickPlay' は実行時値 'quick' と不一致で
    // 「速攻」が欠落する潜在バグだった。本テストは修正を固定する。
    const record = convertCardToVectorRecord(makeSpellCard('quick'))
    expect(record.text).toContain('速攻魔法')
    expect(record.metadata.spellEffectType).toBe('quick')
  })

  it('通常魔法(spellEffectType="normal")は「通常魔法」', () => {
    const record = convertCardToVectorRecord(makeSpellCard('normal'))
    expect(record.text).toContain('通常魔法')
  })

  it('儀式魔法(spellEffectType="ritual")は「儀式魔法」', () => {
    const record = convertCardToVectorRecord(makeSpellCard('ritual'))
    expect(record.text).toContain('儀式魔法')
  })

  it('永続魔法(spellEffectType="continuous")は「永続魔法」', () => {
    const record = convertCardToVectorRecord(makeSpellCard('continuous'))
    expect(record.text).toContain('永続魔法')
  })

  it('装備魔法(spellEffectType="equip")は「装備魔法」', () => {
    const record = convertCardToVectorRecord(makeSpellCard('equip'))
    expect(record.text).toContain('装備魔法')
  })

  it('フィールド魔法(spellEffectType="field")は「フィールド魔法」', () => {
    const record = convertCardToVectorRecord(makeSpellCard('field'))
    expect(record.text).toContain('フィールド魔法')
  })

  it('未知の spellEffectType は「魔法」のみ（前置きなし）', () => {
    const record = convertCardToVectorRecord(makeSpellCard('unknown'))
    expect(record.text).toContain('魔法')
    expect(record.text).not.toMatch(/通常魔法|永続魔法|装備魔法|フィールド魔法|速攻魔法|儀式魔法/)
  })
})
