import { Card } from './card.js';
export interface FAQRecord {
    faqId: number;
    question: string;
    answer: string;
    updatedAt: string;
}
export interface CardReference {
    cardId: number;
    cardName: string;
    position: number;
}
export interface FAQWithCards extends FAQRecord {
    questionCards: Array<Card>;
    answerCards: Array<Card>;
    allCardIds: number[];
}
export interface FAQSearchResult {
    faq: FAQWithCards;
    score?: number;
}
export interface FAQIndex {
    byId: Map<number, FAQRecord>;
    byCardId: Map<number, number[]>;
    normalized: Map<number, {
        question: string;
        answer: string;
    }>;
}
//# sourceMappingURL=faq.d.ts.map