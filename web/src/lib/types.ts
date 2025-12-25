/**
 * カード情報の型定義
 */
export interface Card {
  cardType: string
  name: string
  cardId: string
  [key: string]: string
}

/**
 * FAQ情報の型定義
 */
export interface Faq {
  faqId: string
  question: string
  answer: string
  updatedAt: string
}

/**
 * 数値範囲フィルタ
 */
export interface RangeFilter {
  min?: number
  max?: number
  exact?: number
  questionMark?: boolean
}

/**
 * 選択肢フィルタの選択状態
 */
export interface OptionFilterSelection {
  positive: string[]
  negative: string[]
  operator: 'and' | 'or'
}

/**
 * カード検索パラメータ
 */
export interface SearchParams {
  /** 検索クエリ文字列（検索モードパーサー対応） */
  query?: string
  /** 検索対象フィールド */
  fields?: Array<'name' | 'ruby' | 'text' | 'pendulumText' | 'supplementInfo' | 'pendulumSupplementInfo' | 'all'>
  /** 選択肢フィルタ */
  optionFilters?: {
    cardType?: OptionFilterSelection
    spellEffectType?: OptionFilterSelection
    trapEffectType?: OptionFilterSelection
    monsterTypes?: OptionFilterSelection
    race?: OptionFilterSelection
    attribute?: OptionFilterSelection
    linkMarkers?: OptionFilterSelection
  }
  /** 数値範囲フィルタ */
  rangeFilters?: {
    atk?: RangeFilter
    def?: RangeFilter
    linkValue?: RangeFilter
    pendulumScale?: RangeFilter
    cardId?: RangeFilter
    levelValue?: RangeFilter
  }
  /** フィルタ条件（旧方式との互換性のため残す） */
  filter?: Record<string, any>
  mode?: 'exact' | 'partial'
  flagAutoModify?: boolean
  flagAllowWild?: boolean
  flagNearly?: boolean
  max?: number
}

/**
 * FAQ検索パラメータ
 */
export interface FaqSearchParams {
  /** 検索クエリ文字列 */
  query?: string
  /** 検索対象フィールド */
  fields?: Array<'question' | 'answer' | 'all'>
  /** 登場カード名フィルタ */
  cardName?: string
  /** FAQ ID フィルタ */
  faqId?: string
  /** 更新日フィルタ（YYYY-MM-DD） */
  updatedAt?: string
  /** 最大結果数 */
  max?: number
}
