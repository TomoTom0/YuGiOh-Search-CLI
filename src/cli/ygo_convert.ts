#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'format-converter.js');

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`Usage: ygo_convert <input:output> [<input:output> ...]

Convert between JSON, JSONL, JSONC, and YAML formats.

Arguments:
  input:output        Input and output file paths separated by ':'
                      Format is auto-detected from file extension
  
Supported formats:
  .json               Standard JSON
  .jsonl              JSON Lines (one JSON object per line)
  .jsonc              JSON with Comments
  .yaml, .yml         YAML

Examples:
  ygo_convert input.json:output.jsonl
  ygo_convert data.yaml:output.json
  ygo_convert a.json:a.yaml b.jsonl:b.json
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
