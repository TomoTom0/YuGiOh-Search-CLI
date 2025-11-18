#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'search-cards.js');
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_search <filter> [options]

Search Yu-Gi-Oh cards database.

Arguments:
  filter              Filter JSON object, e.g. '{"name":"青眼"}'
  
Options:
  cols=col1,col2      Columns to return (comma-separated)
  mode=exact|partial  Search mode (default: exact)
  outputPath=path     Output file path
  outputDir=dir       Output directory
  
Environment:
  YGO_OUTPUT_DIR      Default output directory

Examples:
  ygo_search '{"name":"青眼"}'
  ygo_search '{"name":"青眼"}' cols=name,cardId,text
  ygo_search '{"text":"*破壊*"}' outputPath=results.jsonl
  ygo_search '{"cardType":"罠","trapEffectType":"カウンター罠"}' cols=name,text
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
//# sourceMappingURL=ygo_search.js.map