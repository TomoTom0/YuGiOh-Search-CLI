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
    const queries = patterns.map(p => {
        const filter = {};
        if (p.type === 'cardId') {
            filter.cardId = p.query;
        }
        else {
            filter.name = p.query;
        }
        const query = {
            filter,
            cols,
        };
        if (p.type === 'flexible') {
            query.flagAllowWild = true;
            query.flagAutoModify = true;
        }
        else if (p.type === 'exact') {
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
                resolve(patterns.map(p => ({
                    pattern: p.pattern,
                    type: p.type,
                    query: p.query,
                    results: []
                })));
                return;
            }
            try {
                const results = JSON.parse(stdout);
                resolve(patterns.map((p, i) => ({
                    pattern: p.pattern,
                    type: p.type,
                    query: p.query,
                    results: results[i] || []
                })));
            }
            catch (e) {
                resolve(patterns.map(p => ({
                    pattern: p.pattern,
                    type: p.type,
                    query: p.query,
                    results: []
                })));
            }
        });
        child.on('error', () => {
            resolve(patterns.map(p => ({
                pattern: p.pattern,
                type: p.type,
                query: p.query,
                results: []
            })));
        });
    });
}
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: extract-and-search-cards.ts <text>');
        console.error('Example: extract-and-search-cards.ts "I use {ブルーアイズ*} and 《青眼の白龍》 cards"');
        process.exit(2);
    }
    const text = args[0];
    // Extract patterns
    const patterns = extractCardPatterns(text);
    if (patterns.length === 0) {
        console.log(JSON.stringify({
            cards: []
        }, null, 2));
        return;
    }
    // Search all patterns using bulk search (performance improvement)
    const cards = await bulkSearchCards(patterns);
    const result = {
        cards: cards
    };
    // Output as JSONL (single object on one line)
    console.log(JSON.stringify(result));
}
main().catch(e => {
    console.error(e);
    process.exit(2);
});
//# sourceMappingURL=extract-and-search-cards.js.map