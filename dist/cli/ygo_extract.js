#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'extract-and-search-cards.js');
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_extract <text> [options]

Extract Yu-Gi-Oh card names from text and search them.

Arguments:
  text                Text containing card names
  
Options:
  cols=col1,col2      Columns to return (comma-separated)
  outputPath=path     Output file path
  outputDir=dir       Output directory
  
Examples:
  ygo_extract "青眼の白龍とブラック・マジシャンを召喚"
  ygo_extract "青眼の白龍で攻撃" cols=name,cardId,atk
`);
        process.exit(0);
    }
    const proc = spawn('node', [scriptPath, ...args], {
        stdio: 'inherit'
    });
    proc.on('exit', (code) => {
        process.exit(code || 0);
    });
}
main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
});
//# sourceMappingURL=ygo_extract.js.map