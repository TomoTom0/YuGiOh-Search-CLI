#!/usr/bin/env node
import { loadFAQIndex, getCardsByIds, extractCardReferences } from './utils/faq-loader.js';
import path from 'path';
import url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
function matchesQuery(text, normalized, query, flagAllowWild) {
    if (!query)
        return true;
    if (flagAllowWild && query.includes('*')) {
        const regex = new RegExp(query.split('*').map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*'), 'i');
        return regex.test(normalized);
    }
    return normalized.includes(query.toLowerCase());
}
async function enrichFAQWithCards(faq) {
    const questionRefs = extractCardReferences(faq.question);
    const answerRefs = extractCardReferences(faq.answer);
    const allCardIds = Array.from(new Set([
        ...questionRefs.map(r => r.cardId),
        ...answerRefs.map(r => r.cardId)
    ]));
    const cardsMap = await getCardsByIds(allCardIds);
    const questionCards = questionRefs
        .map(ref => cardsMap.get(ref.cardId))
        .filter(c => c !== undefined);
    const answerCards = answerRefs
        .map(ref => cardsMap.get(ref.cardId))
        .filter(c => c !== undefined);
    return {
        ...faq,
        questionCards,
        answerCards,
        allCardIds
    };
}
async function searchCardsByFilter(filter) {
    const { searchCards } = await import('./lib/card-search-core.js');
    const results = await searchCards({ filter, cols: ['cardId'] });
    return results.map((card) => parseInt(card.cardId)).filter((id) => !isNaN(id));
}
export async function searchFAQ(params) {
    const { faqId, cardId, cardName, cardFilter, question, answer, limit = 50, flagAllowWild = true } = params;
    const index = await loadFAQIndex();
    const results = [];
    if (faqId !== undefined) {
        const faq = index.byId.get(faqId);
        if (faq) {
            const enriched = await enrichFAQWithCards(faq);
            results.push({ faq: enriched });
        }
        return results;
    }
    if (cardId !== undefined) {
        const faqIds = index.byCardId.get(cardId) || [];
        for (const id of faqIds.slice(0, limit)) {
            const faq = index.byId.get(id);
            if (faq) {
                const enriched = await enrichFAQWithCards(faq);
                results.push({ faq: enriched });
            }
        }
        return results;
    }
    if (cardName !== undefined) {
        const cardIds = await searchCardsByFilter({ name: cardName });
        const faqIdSet = new Set();
        for (const cid of cardIds) {
            const faqIds = index.byCardId.get(cid) || [];
            for (const fid of faqIds) {
                faqIdSet.add(fid);
            }
        }
        const sortedFaqIds = Array.from(faqIdSet).sort((a, b) => a - b);
        for (const id of sortedFaqIds.slice(0, limit)) {
            const faq = index.byId.get(id);
            if (faq) {
                const enriched = await enrichFAQWithCards(faq);
                results.push({ faq: enriched });
            }
        }
        return results;
    }
    if (cardFilter !== undefined) {
        const cardIds = await searchCardsByFilter(cardFilter);
        const faqIdSet = new Set();
        for (const cid of cardIds) {
            const faqIds = index.byCardId.get(cid) || [];
            for (const fid of faqIds) {
                faqIdSet.add(fid);
            }
        }
        const sortedFaqIds = Array.from(faqIdSet).sort((a, b) => a - b);
        for (const id of sortedFaqIds.slice(0, limit)) {
            const faq = index.byId.get(id);
            if (faq) {
                const enriched = await enrichFAQWithCards(faq);
                results.push({ faq: enriched });
            }
        }
        return results;
    }
    for (const [id, faq] of index.byId.entries()) {
        if (results.length >= limit)
            break;
        const norm = index.normalized.get(id);
        if (!norm)
            continue;
        let matches = true;
        if (question) {
            matches = matches && matchesQuery(faq.question, norm.question, question, flagAllowWild);
        }
        if (answer) {
            matches = matches && matchesQuery(faq.answer, norm.answer, answer, flagAllowWild);
        }
        if (matches) {
            const enriched = await enrichFAQWithCards(faq);
            results.push({ faq: enriched });
        }
    }
    return results;
}
function formatOutput(results, options) {
    const { fcols, cols, format = 'json' } = options;
    // Apply random/range/all filtering
    let filteredResults = [...results];
    if (options.range) {
        const [start, end] = options.range;
        filteredResults = filteredResults.filter(r => r.faq.faqId >= start && r.faq.faqId <= end);
    }
    if (options.random && filteredResults.length > 0) {
        filteredResults = filteredResults
            .sort(() => Math.random() - 0.5)
            .slice(0, options.all ? filteredResults.length : results.length);
    }
    // Build output based on format
    if (format === 'json') {
        if (!fcols && !cols) {
            return JSON.stringify(filteredResults, null, 2);
        }
        const formatted = filteredResults.map(r => {
            const output = {};
            if (fcols) {
                for (const col of fcols) {
                    if (col in r.faq)
                        output[col] = r.faq[col];
                }
            }
            else {
                Object.assign(output, r.faq);
            }
            if (cols) {
                output.questionCards = r.faq.questionCards.map(c => filterCardCols(c, cols));
                output.answerCards = r.faq.answerCards.map(c => filterCardCols(c, cols));
            }
            return output;
        });
        return JSON.stringify(formatted, null, 2);
    }
    if (format === 'jsonl') {
        return filteredResults.map(r => {
            if (!fcols && !cols)
                return JSON.stringify(r);
            const output = {};
            if (fcols) {
                for (const col of fcols) {
                    if (col in r.faq)
                        output[col] = r.faq[col];
                }
            }
            else {
                Object.assign(output, r.faq);
            }
            if (cols) {
                output.questionCards = r.faq.questionCards.map(c => filterCardCols(c, cols));
                output.answerCards = r.faq.answerCards.map(c => filterCardCols(c, cols));
            }
            return JSON.stringify(output);
        }).join('\n');
    }
    if (format === 'csv' || format === 'tsv') {
        const delimiter = format === 'csv' ? ',' : '\t';
        const effectiveFcols = fcols || ['faqId', 'question', 'answer', 'updatedAt'];
        const lines = [effectiveFcols.join(delimiter)];
        for (const r of filteredResults) {
            const values = effectiveFcols.map(col => {
                const val = r.faq[col];
                return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
            });
            lines.push(values.join(delimiter));
        }
        return lines.join('\n');
    }
    return JSON.stringify(filteredResults, null, 2);
}
function filterCardCols(card, cols) {
    const filtered = {};
    for (const col of cols) {
        if (col in card)
            filtered[col] = card[col];
    }
    return filtered;
}
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: node search-faq.js <params_json_or_key=value> [options]');
        console.error('Example: node search-faq.js \'{"cardId":6808}\'');
        console.error('Example: node search-faq.js cardId=6808 --fcol faqId,question');
        console.error('Example: node search-faq.js cardName="青眼*" --format csv');
        process.exit(1);
    }
    try {
        const params = {};
        const options = {};
        let jsonMode = false;
        // Check if first arg is JSON
        if (args[0].startsWith('{')) {
            Object.assign(params, JSON.parse(args[0]));
            jsonMode = true;
        }
        // Parse all arguments
        for (let i = jsonMode ? 1 : 0; i < args.length; i++) {
            const arg = args[i];
            // Options with -- prefix
            if (arg === '--fcol' && args[i + 1]) {
                options.fcols = args[++i].split(',');
            }
            else if (arg === '--col' && args[i + 1]) {
                options.cols = args[++i].split(',');
            }
            else if (arg === '--format' && args[i + 1]) {
                options.format = args[++i];
            }
            else if (arg === '--random') {
                options.random = true;
            }
            else if (arg === '--range' && args[i + 1]) {
                const [start, end] = args[++i].split('-').map(Number);
                options.range = [start, end];
            }
            else if (arg === '--all') {
                options.all = true;
            }
            // key=value style parameters
            else if (!jsonMode && arg.includes('=')) {
                const [key, ...valueParts] = arg.split('=');
                let value = valueParts.join('=');
                // Remove quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                // Parse nested keys (e.g., cardFilter.race=dragon)
                if (key.includes('.')) {
                    const parts = key.split('.');
                    const mainKey = parts[0];
                    const subKey = parts[1];
                    if (!params[mainKey])
                        params[mainKey] = {};
                    params[mainKey][subKey] = value;
                }
                else {
                    // Convert numeric strings to numbers
                    if (key === 'faqId' || key === 'cardId' || key === 'limit') {
                        params[key] = parseInt(value);
                    }
                    else if (key === 'flagAllowWild') {
                        params[key] = value === 'true';
                    }
                    else {
                        params[key] = value;
                    }
                }
            }
        }
        const results = await searchFAQ(params);
        console.log(formatOutput(results, options));
    }
    catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
//# sourceMappingURL=search-faq.js.map