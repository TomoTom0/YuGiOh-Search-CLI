import { FAQIndex, CardReference } from '../types/faq.js';
import { Card } from '../types/card.js';
export declare function extractCardReferences(text: string): CardReference[];
export declare function loadFAQIndex(): Promise<FAQIndex>;
export declare function getCardsByIds(cardIds: number[]): Promise<Map<number, Card>>;
export declare function clearCache(): void;
//# sourceMappingURL=faq-loader.d.ts.map