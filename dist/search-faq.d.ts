#!/usr/bin/env node
import { FAQSearchResult } from './types/faq.js';
export interface SearchFAQParams {
    faqId?: number;
    cardId?: number;
    cardName?: string;
    cardFilter?: Record<string, any>;
    question?: string;
    answer?: string;
    limit?: number;
    flagAllowWild?: boolean;
}
export declare function searchFAQ(params: SearchFAQParams): Promise<FAQSearchResult[]>;
//# sourceMappingURL=search-faq.d.ts.map