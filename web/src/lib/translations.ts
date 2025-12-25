/**
 * カード属性の日本語翻訳マッピング
 */
export const attributeTranslations: Record<string, string> = {
  dark: '闇',
  divine: '神',
  earth: '地',
  fire: '炎',
  light: '光',
  water: '水',
  wind: '風'
}

/**
 * 種族の日本語翻訳マッピング
 */
export const raceTranslations: Record<string, string> = {
  aqua: '水族',
  beast: '獣族',
  beastwarrior: '獣戦士族',
  creatorgod: '創造神族',
  cyberse: 'サイバース族',
  dinosaur: '恐竜族',
  divine: '幻神獣族',
  dragon: 'ドラゴン族',
  fairy: '天使族',
  fiend: '悪魔族',
  fish: '魚族',
  illusion: '幻竜族',
  insect: '昆虫族',
  machine: '機械族',
  plant: '植物族',
  psychic: 'サイキック族',
  pyro: '炎族',
  reptile: '爬虫類族',
  rock: '岩石族',
  seaserpent: '海竜族',
  spellcaster: '魔法使い族',
  thunder: '雷族',
  warrior: '戦士族',
  windbeast: '鳥獣族',
  wyrm: '幻竜族',
  zombie: 'アンデット族'
}

/**
 * レベル種別の日本語翻訳マッピング
 */
export const levelTypeTranslations: Record<string, string> = {
  level: 'レベル',
  rank: 'ランク',
  link: 'リンク'
}

/**
 * カードタイプの日本語翻訳マッピング
 */
export const cardTypeTranslations: Record<string, string> = {
  monster: 'モンスター',
  spell: '魔法',
  trap: '罠'
}

/**
 * 魔法効果タイプの日本語翻訳マッピング
 */
export const spellEffectTypeTranslations: Record<string, string> = {
  normal: '通常',
  quick: '速攻',
  continuous: '永続',
  equip: '装備',
  field: 'フィールド',
  ritual: '儀式'
}

/**
 * 罠効果タイプの日本語翻訳マッピング
 */
export const trapEffectTypeTranslations: Record<string, string> = {
  normal: '通常',
  continuous: '永続',
  counter: 'カウンター'
}

/**
 * フィールド名の日本語翻訳マッピング
 */
export const fieldNameTranslations: Record<string, string> = {
  cardType: 'カードタイプ',
  name: 'カード名',
  ruby: 'ルビ',
  cardId: 'カードID',
  imgs: '画像',
  text: 'テキスト',
  attribute: '属性',
  levelType: 'レベル種別',
  levelValue: 'レベル値',
  race: '種族',
  monsterTypes: 'モンスタータイプ',
  atk: '攻撃力',
  def: '守備力',
  linkMarkers: 'リンクマーカー',
  pendulumScale: 'ペンデュラムスケール',
  pendulumText: 'ペンデュラム効果',
  spellEffectType: '魔法タイプ',
  trapEffectType: '罠タイプ',
  supplementInfo: '補足情報',
  pendulumSupplementInfo: 'ペンデュラム補足情報'
}

/**
 * 値を日本語に翻訳する
 * テキストフィールドの場合、\nを改行文字に変換する
 */
export function translateValue(fieldName: string, value: string): string {
  let translatedValue: string

  switch (fieldName) {
    case 'attribute':
      translatedValue = attributeTranslations[value] || value
      break
    case 'race':
      translatedValue = raceTranslations[value] || value
      break
    case 'levelType':
      translatedValue = levelTypeTranslations[value] || value
      break
    case 'cardType':
      translatedValue = cardTypeTranslations[value] || value
      break
    case 'spellEffectType':
      translatedValue = spellEffectTypeTranslations[value] || value
      break
    case 'trapEffectType':
      translatedValue = trapEffectTypeTranslations[value] || value
      break
    default:
      translatedValue = value
  }

  // テキストフィールドの場合、\nを改行文字に変換
  const textFields = ['text', 'pendulumText', 'supplementInfo', 'pendulumSupplementInfo']
  if (textFields.includes(fieldName)) {
    translatedValue = translatedValue.replace(/\\n/g, '\n')
  }

  return translatedValue
}

/**
 * フィールド名を日本語に翻訳する
 */
export function translateFieldName(fieldName: string): string {
  return fieldNameTranslations[fieldName] || fieldName
}
