/**
 * Extract card name patterns from text
 * Supports {card-name} (flexible), 《card-name》 (exact), and {{card-name|cardId}} (by ID)
 *
 * @param text Text containing card name patterns
 * @param options Options for extraction
 * @returns Array of extracted patterns
 */
export function extractCardPatterns(text, options = {}) {
    const patterns = [];
    const usedPositions = new Set();
    // Pattern 1: {{card-name|cid}} - already processed / cardId search
    const cardIdPattern = /\{\{([^|]+)\|([^}]+)\}\}/g;
    let match;
    while ((match = cardIdPattern.exec(text)) !== null) {
        const extracted = {
            pattern: match[0],
            type: 'cardId',
            query: match[2].trim(),
            originalName: match[1].trim() // 元のカード名を保存
        };
        if (options.includeStartIndex) {
            extracted.startIndex = match.index;
        }
        patterns.push(extracted);
        for (let i = match.index; i < match.index + match[0].length; i++) {
            usedPositions.add(i);
        }
    }
    // Pattern 2: 《card-name》 - exact name search
    const exactPattern = /《([^》]+)》/g;
    while ((match = exactPattern.exec(text)) !== null) {
        if (usedPositions.has(match.index))
            continue;
        const extracted = {
            pattern: match[0],
            type: 'exact',
            query: match[1].trim()
        };
        if (options.includeStartIndex) {
            extracted.startIndex = match.index;
        }
        patterns.push(extracted);
        for (let i = match.index; i < match.index + match[0].length; i++) {
            usedPositions.add(i);
        }
    }
    // Pattern 3: {card-name} - flexible name search
    const flexiblePattern = /\{([^}]+)\}/g;
    while ((match = flexiblePattern.exec(text)) !== null) {
        if (usedPositions.has(match.index))
            continue;
        const extracted = {
            pattern: match[0],
            type: 'flexible',
            query: match[1].trim()
        };
        if (options.includeStartIndex) {
            extracted.startIndex = match.index;
        }
        patterns.push(extracted);
        for (let i = match.index; i < match.index + match[0].length; i++) {
            usedPositions.add(i);
        }
    }
    return patterns;
}
//# sourceMappingURL=pattern-extractor.js.map