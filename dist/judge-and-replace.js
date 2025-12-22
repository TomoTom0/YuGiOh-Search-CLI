#!/usr/bin/env node
import { judgeAndReplace } from './lib/judge-and-replace.js';
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
    const text = args.filter((arg)=>!arg.startsWith('--'))[0];
    const result = await judgeAndReplace(text, {
        mountPar: mountParMode
    });
    // Output result
    if (rawMode) {
        console.log(result.processedText);
    } else {
        // Output as JSONL (single object on one line)
        console.log(JSON.stringify(result));
    }
}
main().catch((e)=>{
    console.error(e);
    process.exit(2);
});
