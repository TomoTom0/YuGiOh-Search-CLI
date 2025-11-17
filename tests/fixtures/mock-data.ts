export const MOCK_CARD_DATA = [
  {
    cardId: '4007',
    name: '青眼の白龍',
    ruby: 'ブルーアイズ・ホワイト・ドラゴン',
    cardType: 'monster',
    attribute: '光',
    race: 'ドラゴン族',
    levelType: 'level',
    levelValue: '8',
    atk: '3000',
    def: '2500',
    text: 'このカードは特殊召喚できない。',
    monsterTypes: ['通常']
  },
  {
    cardId: '5053',
    name: 'ブラック・マジシャン',
    ruby: 'ブラック・マジシャン',
    cardType: 'monster',
    attribute: '闇',
    race: '魔法使い族',
    levelType: 'level',
    levelValue: '7',
    atk: '2500',
    def: '2100',
    text: '魔法使いとしては、攻撃力・守備力ともに最高クラス。',
    monsterTypes: ['通常']
  },
  {
    cardId: '2129',
    name: '青眼の究極竜',
    ruby: 'ブルーアイズ・アルティメットドラゴン',
    cardType: 'monster',
    attribute: '光',
    race: 'ドラゴン族',
    levelType: 'level',
    levelValue: '12',
    atk: '4500',
    def: '3800',
    text: '「青眼の白龍」×３',
    monsterTypes: ['融合'],
    isExtraDeck: true
  },
  {
    cardId: '10000',
    name: '青眼の亜白龍',
    ruby: 'ブルーアイズ・オルタナティブ・ホワイト・ドラゴン',
    cardType: 'monster',
    attribute: '光',
    race: 'ドラゴン族',
    levelType: 'level',
    levelValue: '8',
    atk: '3000',
    def: '2500',
    text: 'このカード名の①②の効果は...',
    monsterTypes: ['効果']
  },
  {
    cardId: '10001',
    name: '青眼の白龍',
    ruby: 'ブルーアイズ・ホワイト・ドラゴン',
    cardType: 'monster',
    attribute: '光',
    race: 'ドラゴン族',
    levelType: 'level',
    levelValue: '8',
    atk: '3000',
    def: '2500',
    text: '高い攻撃力を誇る伝説のドラゴン。どんな相手でも粉砕する、その破壊力は計り知れない。',
    monsterTypes: ['通常']
  },
  {
    cardId: '20000',
    name: 'Evil★Twin キスキル',
    ruby: 'イビルツイン キスキル',
    cardType: 'monster',
    attribute: '闇',
    race: '悪魔族',
    levelType: 'level',
    levelValue: '2',
    atk: '200',
    def: '200',
    text: 'このカード名の①②の効果は...',
    monsterTypes: ['効果']
  },
  {
    cardId: '20001',
    name: 'Live☆Twin リィラ',
    ruby: 'ライブツイン リィラ',
    cardType: 'monster',
    attribute: '光',
    race: 'サイバース族',
    levelType: 'level',
    levelValue: '2',
    atk: '200',
    def: '200',
    text: 'このカード名の①②の効果は...',
    monsterTypes: ['効果']
  },
  {
    cardId: '30000',
    name: '増殖',
    ruby: 'ぞうしょく',
    cardType: 'spell',
    spellEffectType: '通常',
    text: '自分フィールド上に存在するモンスター１体を選択して発動する。'
  },
  {
    cardId: '30001',
    name: '死者蘇生',
    ruby: 'ししゃそせい',
    cardType: 'spell',
    spellEffectType: '通常',
    text: '自分または相手の墓地のモンスター１体を対象として発動できる。'
  },
  {
    cardId: '40000',
    name: '聖なるバリア -ミラーフォース-',
    ruby: 'せいなるバリア －ミラーフォース－',
    cardType: 'trap',
    trapEffectType: '通常',
    text: '相手モンスターの攻撃宣言時に発動できる。'
  }
]

export function getMockCardById(cardId: string) {
  return MOCK_CARD_DATA.find(c => c.cardId === cardId)
}

export function getMockCardsByName(name: string, exact: boolean = true) {
  if (exact) {
    return MOCK_CARD_DATA.filter(c => c.name === name)
  }
  return MOCK_CARD_DATA.filter(c => c.name.includes(name))
}

export function getMockCardsByPattern(pattern: string) {
  const regex = new RegExp(pattern.replace(/\*/g, '.*'))
  return MOCK_CARD_DATA.filter(c => regex.test(c.name) || regex.test(c.ruby))
}
