#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';
import { extractCardPatterns } from './utils/pattern-extractor.js';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const bulkSearchScript = path.join(__dirname, 'bulk-search-cards.js');
// Execute bulk search for all patterns at once (performance improvement)
async function bulkSearchCards(patterns) {
    const cols = [
        'cardType', 'name', 'ruby', 'cardId', 'ciid', 'imgs',
        'text', 'attribute', 'levelType', 'levelValue', 'race', 'monsterTypes',
        'atk', 'def', 'linkMarkers', 'pendulumScale', 'pendulumText',
        'isExtraDeck', 'spellEffectType', 'trapEffectType',
        'supplementInfo', 'supplementDate', 'pendulumSupplementInfo', 'pendulumSupplementDate'
    ];
    // Build queries for bulk search
    const queries = patterns.map(pattern => {
        const query = {};
        if (pattern.type === 'cardId') {
            query.filter = { cardId: pattern.query };
        }
        else {
            query.filter = { name: pattern.query };
        }
        query.cols = cols;
        if (pattern.type === 'flexible') {
            query.flagAllowWild = true;
            query.flagAutoModify = true;
        }
        else if (pattern.type === 'exact') {
            query.flagAllowWild = false;
            query.flagAutoModify = true;
        }
        return query;
    });
    return new Promise((resolve) => {
        const child = spawn('node', [bulkSearchScript, JSON.stringify(queries)], {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });
        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });
        child.on('close', (code) => {
            if (code !== 0) {
                // Return empty results for all patterns on error
                resolve(patterns.map(() => []));
                return;
            }
            try {
                const result = JSON.parse(stdout);
                resolve(result);
            }
            catch (e) {
                resolve(patterns.map(() => []));
            }
        });
        child.on('error', () => {
            resolve(patterns.map(() => []));
        });
    });
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: judge-and-replace.ts <text> [--raw] [--mount-par]');
        console.error('Example: judge-and-replace.ts "I use {ブルーアイズ*} and 《青眼の白龍》 cards"');
        console.error('Options:');
        console.error('  --raw         Output only processedText (no JSON)');
        console.error('  --mount-par   Replace with 《official card name》 format');
        process.exit(2);
    }
    const rawMode = args.includes('--raw');
    const mountParMode = args.includes('--mount-par');
    const text = args.filter(arg => !arg.startsWith('--'))[0];
    const patterns = extractCardPatterns(text, { includeStartIndex: true });
    if (patterns.length === 0) {
        if (rawMode) {
            console.log(text);
        }
        else {
            console.log(JSON.stringify({
                processedText: text,
                hasUnprocessed: false,
                warnings: [],
                processedPatterns: []
            }, null, 2));
        }
        return;
    }
    // Deduplicate patterns before search for efficiency
    const uniquePatternMap = new Map();
    for (const pattern of patterns) {
        const key = `${pattern.type}::${pattern.query}`;
        if (!uniquePatternMap.has(key)) {
            uniquePatternMap.set(key, pattern);
        }
    }
    const uniquePatterns = Array.from(uniquePatternMap.values());
    // Bulk search unique patterns only
    const searchResults = await bulkSearchCards(uniquePatterns);
    // Create lookup map for search results
    const resultMap = new Map();
    for (let i = 0; i < uniquePatterns.length; i++) {
        const pattern = uniquePatterns[i];
        const key = `${pattern.type}::${pattern.query}`;
        resultMap.set(key, searchResults[i]);
    }
    // Build result
    const result = {
        processedText: text,
        hasUnprocessed: false,
        warnings: [],
        processedPatterns: []
    };
    // Process replacements in reverse order to maintain indices
    const patternsWithResults = patterns.map((p) => {
        const key = `${p.type}::${p.query}`;
        return {
            pattern: p.pattern,
            type: p.type,
            query: p.query,
            results: resultMap.get(key) || [],
            startIndex: p.startIndex,
            originalName: p.originalName // cardIdパターンの元のカード名
        };
    });
    const sortedResults = patternsWithResults.sort((a, b) => b.startIndex - a.startIndex);
    // Track processed patterns to avoid duplicates
    const processedPatternKeys = new Set();
    for (const match of sortedResults) {
        if (match.type === 'cardId') {
            // cardIdパターン: カードidで検索してカード名を検証・置き換え
            const resultCount = match.results.length;
            let replacement = match.pattern;
            let status = 'already_processed';
            let warning;
            if (resultCount === 1) {
                const card = match.results[0];
                const actualName = card.name;
                const providedName = match.originalName || '';
                if (actualName !== providedName) {
                    status = 'corrected';
                    replacement = mountParMode ? `《${actualName}》` : `{{${actualName}|${card.cardId}}}`;
                    warning = `⚠️ カード名を修正: "${providedName}" → "${actualName}" (cardId: ${card.cardId})`;
                    result.processedText = result.processedText.substring(0, match.startIndex) +
                        replacement +
                        result.processedText.substring(match.startIndex + match.pattern.length);
                }
            }
            else if (resultCount === 0) {
                warning = `⚠️ cardId "${match.query}" が見つかりません`;
            }
            else {
                // 複数結果（通常はcardIdでは起きないがデータの問題を示唆）
                warning = `⚠️ cardId "${match.query}" で複数のカードが見つかりました。データを確認してください。`;
            }
            const key = `${match.pattern}::${replacement}`;
            if (!processedPatternKeys.has(key)) {
                processedPatternKeys.add(key);
                result.processedPatterns.push({
                    original: match.pattern,
                    replaced: replacement,
                    status: status
                });
                if (warning) {
                    result.warnings.push(warning);
                }
            }
            continue;
        }
        const resultCount = match.results.length;
        if (resultCount === 1) {
            // Exactly one result - replace with {{name|cardId}} or 《name》
            const card = match.results[0];
            const replacement = mountParMode ? `《${card.name}》` : `{{${card.name}|${card.cardId}}}`;
            result.processedText = result.processedText.substring(0, match.startIndex) +
                replacement +
                result.processedText.substring(match.startIndex + match.pattern.length);
            const key = `${match.pattern}::${replacement}`;
            if (!processedPatternKeys.has(key)) {
                processedPatternKeys.add(key);
                result.processedPatterns.push({
                    original: match.pattern,
                    replaced: replacement,
                    status: 'resolved'
                });
            }
        }
        else if (resultCount > 1) {
            // Multiple results - format as {{`original`_`name|id`_`name|id`_...}}
            const candidatesStr = match.results
                .map((card) => `\`${card.name}|${card.cardId}\``)
                .join('_');
            const replacement = `{{\`${match.query}\`_${candidatesStr}}}`;
            result.processedText = result.processedText.substring(0, match.startIndex) +
                replacement +
                result.processedText.substring(match.startIndex + match.pattern.length);
            const key = `${match.pattern}::${replacement}`;
            if (!processedPatternKeys.has(key)) {
                processedPatternKeys.add(key);
                result.processedPatterns.push({
                    original: match.pattern,
                    replaced: replacement,
                    status: 'multiple'
                });
            }
            result.hasUnprocessed = true;
        }
        else {
            // No results - format as {{NOTFOUND_`original`}}
            const replacement = `{{NOTFOUND_\`${match.query}\`}}`;
            result.processedText = result.processedText.substring(0, match.startIndex) +
                replacement +
                result.processedText.substring(match.startIndex + match.pattern.length);
            const key = `${match.pattern}::${replacement}`;
            if (!processedPatternKeys.has(key)) {
                processedPatternKeys.add(key);
                result.processedPatterns.push({
                    original: match.pattern,
                    replaced: replacement,
                    status: 'notfound'
                });
            }
            result.hasUnprocessed = true;
        }
    }
    // Check for unprocessed markers
    if (result.hasUnprocessed) {
        result.warnings.push('⚠️ Text contains unprocessed patterns that require manual review');
        const notfoundCount = result.processedPatterns.filter(p => p.status === 'notfound').length;
        const multipleCount = result.processedPatterns.filter(p => p.status === 'multiple').length;
        if (notfoundCount > 0) {
            result.warnings.push(`Found ${notfoundCount} pattern(s) with no matches (NOTFOUND_*)`);
        }
        if (multipleCount > 0) {
            result.warnings.push(`Found ${multipleCount} pattern(s) with multiple matches - please select correct one`);
        }
    }
    // Output result
    if (rawMode) {
        console.log(result.processedText);
    }
    else {
        // Output as JSONL (single object on one line)
        console.log(JSON.stringify(result));
    }
}
main().catch(e => {
    console.error(e);
    process.exit(2);
});
//# sourceMappingURL=judge-and-replace.js.map