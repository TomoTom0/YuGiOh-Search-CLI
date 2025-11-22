#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'search-cards.js');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`Usage: ygo_search [options]

Search Yu-Gi-Oh cards database.

Filter Options (at least one required):
  --name <value>            Card name filter
  --text <value>            Card text filter
  --cardId <value>          Card ID filter
  --cardType <value>        Card type filter (monster, spell, trap)
  --race <value>            Race/type filter (dragon, warrior, etc.)
  --attribute <value>       Attribute filter (LIGHT, DARK, etc.)
  --atk <value>             ATK value filter
  --def <value>             DEF value filter
  --level <value>           Level filter
  --levelValue <value>      Level value filter (numeric)
  --pendulumScale <value>   Pendulum scale filter
  --ruby <value>            Ruby (reading) filter
  --linkValue <value>       Link value filter
  --linkArrows <value>      Link arrows filter

Output Options:
  --cols <col1,col2,...>    Columns to return (comma-separated)
  --max <N>                 Maximum results (default: 100)
  --sort <field[:order]>    Sort by field (order: asc|desc)
                            Fields: cardId, name, ruby, atk, def, levelValue, etc.
  --raw                     Raw output mode (suppresses warnings)

Search Options:
  --mode <exact|partial>    Search mode (default: exact)
  --flagAllowWild <bool>    Enable wildcard search with * (default: true)
  --flagAutoModify <bool>   Normalize text for matching (default: true)
  --flagNearly <bool>       Fuzzy matching for typos (default: false)
  --includeRuby <bool>      Search ruby field for name (default: true)
  --flagAutoPend <bool>     Auto-include pendulum text (default: true)
  --flagAutoSupply <bool>   Auto-include supplement info (default: true)
  --flagAutoRuby <bool>     Auto-include ruby for name (default: true)

Alternative key=value Format:
  All options can also be specified as key=value:
  name=青眼 text=*破壊* cols=name,cardId max=50 sort=atk:desc

Legacy JSON Format (still supported):
  ygo_search '{"name":"青眼"}' cols=name,cardId

Environment:
  YGO_OUTPUT_DIR            Default output directory

Examples:
  ygo_search --name "青眼"
  ygo_search --name "青眼" --cols name,cardId,text
  ygo_search --text "*破壊*" --max 50 --sort atk:desc
  ygo_search --cardType trap --sort name --cols name,text
  ygo_search --race dragon --atk 3000 --sort levelValue:asc
  ygo_search name=青眼 cols=name,cardId,text            # key=value format
  ygo_search '{"name":"青眼"}' cols=name,cardId,text    # JSON format
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
