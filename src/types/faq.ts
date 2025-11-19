import { Card } from './card.js'

export interface FAQRecord {
  faqId: number
  question: string
  answer: string
  updatedAt: string
}

export interface CardReference {
  cardId: number
  cardName: string
  position: number // position in text where {{name|id}} appears
}

export interface FAQWithCards extends FAQRecord {
  questionCards: Array<Card>
  answerCards: Array<Card>
  allCardIds: number[] // unique cardIds from both Q&A
}

export interface FAQSearchResult {
  faq: FAQWithCards
  score?: number // for ranked search results
}

export interface FAQIndex {
  byId: Map<number, FAQRecord>
  byCardId: Map<number, number[]> // cardId -> faqIds[]
  normalized: Map<number, {
    question: string
    answer: string
  }>
}
