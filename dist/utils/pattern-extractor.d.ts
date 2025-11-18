import type { ExtractedPattern } from '../types/card';
export interface ExtractOptions {
    includeStartIndex?: boolean;
}
/**
 * Extract card name patterns from text
 * Supports {card-name} (flexible), 《card-name》 (exact), and {{card-name|cardId}} (by ID)
 *
 * @param text Text containing card name patterns
 * @param options Options for extraction
 * @returns Array of extracted patterns
 */
export declare function extractCardPatterns(text: string, options?: ExtractOptions): ExtractedPattern[];
//# sourceMappingURL=pattern-extractor.d.ts.map