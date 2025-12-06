#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'ygo-seek.js');
async function main() {
    const args = process.argv.slice(2);
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
