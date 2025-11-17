#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'bulk-search-cards.ts');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`Usage: ygo_bulk_search <filters...> [options]

Bulk search Yu-Gi-Oh cards with multiple filter sets.

Arguments:
  filters             One or more filter JSON objects
  
Options:
  cols=col1,col2      Columns to return (comma-separated)
  mode=exact|partial  Search mode (default: exact)
  outputPath=path     Output file path
  outputDir=dir       Output directory
  
Examples:
  ygo_bulk_search '{"name":"青眼"}' '{"name":"ブラック・マジシャン"}'
  ygo_bulk_search '{"race":"ドラゴン族"}' '{"race":"魔法使い族"}' cols=name,race,atk
`);
    process.exit(0);
  }

  const proc = spawn('npx', ['tsx', scriptPath, ...args], {
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
