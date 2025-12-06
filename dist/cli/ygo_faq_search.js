#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: ygo_faq_search <params> [options]

Search FAQ database by various criteria.

Parameters (key=value style):
  faqId=N               - Search by FAQ ID
  cardId=N              - Search by card ID (finds FAQs mentioning this card)
  cardName="name"       - Search by card name (supports wildcards with *)
  cardFilter.key=value  - Search by card specs (e.g., cardFilter.race=dragon)
  question="text"       - Search in question text (supports wildcards)
  answer="text"         - Search in answer text (supports wildcards)
  limit=N               - Maximum results (default: 50)

Output Options:
  --fcol a,b,c          - FAQ columns (faqId,question,answer,updatedAt)
  --col a,b,c           - Card columns (cardId,name,atk,def,race,text,etc.)
  --format FORMAT       - Output format: json|csv|tsv|jsonl (default: json)
  --random              - Randomly select from results
  --range start-end     - Filter by FAQ ID range
  --all                 - Return all results (with --range)

Examples (key=value style):
  ygo_faq_search faqId=100
  ygo_faq_search cardId=6808 limit=5
  ygo_faq_search cardName="青眼*" --fcol faqId,question
  ygo_faq_search cardFilter.race=dragon cardFilter.levelValue=8
  ygo_faq_search question="*融合*" --format csv
  ygo_faq_search answer="*無効*" --col name,text

Examples (JSON style - still supported):
  ygo_faq_search '{"faqId":10}'
  ygo_faq_search '{"cardId":6808,"limit":5}' --fcol faqId,question
  ygo_faq_search '{"cardName":"青眼*"}' --format csv
  ygo_faq_search '{"cardFilter":{"race":"dragon","levelValue":"8"}}'
`);
    process.exit(0);
}
// Just delegate to search-faq.js which handles both JSON and key=value
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const searchScript = path.join(__dirname, '../search-faq.js');
const child = spawn('node', [
    searchScript,
    ...process.argv.slice(2)
], {
    stdio: 'inherit'
});
child.on('close', (code)=>{
    process.exit(code || 0);
});
