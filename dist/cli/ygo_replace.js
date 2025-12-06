#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'judge-and-replace.js');
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_replace <text> [options]

Extract card name patterns from text, search for cards, and replace with verified patterns.

Arguments:
  text                Text containing card patterns to replace

Options:
  --raw               Output only processedText (no JSON)
  --mount-par         Replace with 《official card name》 format

Pattern Types:
  {card-name}         Flexible search (wildcards supported)
  《card-name》        Exact search
  {{name|cardId}}     Search by card ID

Examples:
  ygo_replace "{青眼}を召喚して攻撃"
  ygo_replace "Use {ブルーアイズ*} and 《青眼の白龍》"
`);
        process.exit(0);
    }
    const proc = spawn('node', [
        scriptPath,
        ...args
    ], {
        stdio: 'inherit'
    });
    proc.on('exit', (code)=>{
        process.exit(code || 0);
    });
}
main().catch((err)=>{
    console.error('Error:', err.message);
    process.exit(1);
});
