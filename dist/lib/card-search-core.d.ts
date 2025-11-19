/**
 * Core card search logic extracted for library use
 * Used by both CLI (search-cards.ts) and FAQ search (search-faq.ts)
 */
import { Card } from '../types/card.js';
export interface CardSearchParams {
    filter: Record<string, any>;
    cols?: string[] | null;
    mode?: 'exact' | 'partial';
    includeRuby?: boolean;
    flagAutoModify?: boolean;
    flagAllowWild?: boolean;
}
/**
 * Search cards by filter
 * Returns array of Card objects matching the filter
 */
export declare function searchCards(params: CardSearchParams): Promise<Card[]>;
//# sourceMappingURL=card-search-core.d.ts.map