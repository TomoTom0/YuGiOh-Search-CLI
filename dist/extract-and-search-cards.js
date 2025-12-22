#!/usr/bin/env node
import { extractAndSearchCards } from './lib/extract-and-search-cards.js';
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        console.error('Usage: extract-and-search-cards.ts <text>');
        console.error('Example: extract-and-search-cards.ts "I use {ブルーアイズ*} and 《青眼の白龍》 cards"');
        process.exit(2);
    }
    const text = args[0];
    // Extract and search patterns
    const cards = await extractAndSearchCards(text);
    const result = {
        cards: cards
    };
    // Output as JSONL (single object on one line)
    console.log(JSON.stringify(result));
}
main().catch((e)=>{
    console.error(e);
    process.exit(2);
});
