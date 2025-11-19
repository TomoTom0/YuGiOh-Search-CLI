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
  filter                    Filter JSON object, e.g. '{"name":"青眼"}'
  
Options:
  cols=col1,col2            Columns to return (comma-separated)
  mode=exact|partial        Search mode (default: exact)
  max=N                     Maximum results (default: 100)
  sort=field[:order]        Sort by field (order: asc|desc, default based on field type)
                            Fields: cardId, name, ruby, atk, def, levelValue, etc.
  --raw                     Raw output mode (suppresses warnings)
  outputPath=path           Output file path
  outputDir=dir             Output directory
  flagAllowWild=true|false  Enable wildcard search with * (default: true)
  flagAutoModify=true|false Normalize text for matching (default: true)
  
Environment:
  YGO_OUTPUT_DIR            Default output directory

Examples:
  ygo_search '{"name":"青眼"}'
  ygo_search '{"name":"青眼"}' cols=name,cardId,text
  ygo_search '{"text":"*破壊*"}' max=50 sort=atk:desc
  ygo_search '{"text":"*破壊*"}' outputPath=results.jsonl
  ygo_search '{"cardType":"trap"}' sort=name cols=name,text
  ygo_search '{"race":"dragon","atk":"3000"}' sort=levelValue:asc
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