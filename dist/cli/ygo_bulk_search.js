#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import url from 'url';
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const scriptPath = path.join(__dirname, '..', 'bulk-search-cards.js');
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
        console.log(`Usage: ygo_bulk_search <filters> [options]

Bulk search Yu-Gi-Oh cards with multiple filter sets.

Arguments:
  filters             JSON array of filter objects, or space-separated filter objects
  
Options:
  cols=col1,col2      Columns to return (comma-separated)
  mode=exact|partial  Search mode (default: exact)
  outputPath=path     Output file path
  outputDir=dir       Output directory

Input Formats:

  1. Array format (single argument):
     ygo_bulk_search '[{"name":"青眼"},{"name":"ブラック・マジシャン"}]' cols=name,atk

  2. Space-separated format (multiple arguments):
     ygo_bulk_search '{"name":"青眼"}' '{"name":"ブラック・マジシャン"}' cols=name,atk

Examples:
  ygo_bulk_search '[{"name":"青眼"},{"name":"ブラック・マジシャン"}]'
  ygo_bulk_search '{"name":"青眼"}' '{"name":"ブラック・マジシャン"}'
  ygo_bulk_search '[{"race":"dragon"},{"race":"spellcaster"}]' cols=name,race,atk
`);
        process.exit(0);
    }
    // Separate filter arguments from options
    const filters = [];
    const parsedOptions = {};
    const passthroughOptions = [];
    // First, check if the first argument is an array of filters (single argument format)
    if (args.length > 0 && args[0].startsWith('[')) {
        try {
            const filterArray = JSON.parse(args[0]);
            if (Array.isArray(filterArray)) {
                // Array format: ygo_bulk_search '[{...}, {...}]' cols=...
                for (const item of filterArray){
                    if (typeof item === 'object' && item !== null) {
                        filters.push(item);
                    }
                }
                // Process remaining args as options
                for(let i = 1; i < args.length; i++){
                    const arg = args[i];
                    if (arg.includes('=')) {
                        const [key, value] = arg.split('=', 2);
                        if (key === 'cols') {
                            parsedOptions.cols = value.split(',');
                        } else if (key === 'mode') {
                            parsedOptions.mode = value;
                        } else if (key === 'includeRuby') {
                            parsedOptions.includeRuby = value !== 'false';
                        } else if (key === 'flagAutoPend') {
                            parsedOptions.flagAutoPend = value !== 'false';
                        } else if (key === 'flagAutoSupply') {
                            parsedOptions.flagAutoSupply = value !== 'false';
                        } else if (key === 'flagAutoModify') {
                            parsedOptions.flagAutoModify = value !== 'false';
                        } else if (key === 'flagAllowWild') {
                            parsedOptions.flagAllowWild = value !== 'false';
                        } else if (key === 'flagNearly') {
                            parsedOptions.flagNearly = value === 'true';
                        } else {
                            passthroughOptions.push(arg);
                        }
                    } else {
                        passthroughOptions.push(arg);
                    }
                }
            } else {
                throw new Error('First argument must be an array of filters');
            }
        } catch (e) {
            console.error('Invalid JSON array format:', e instanceof Error ? e.message : e);
            process.exit(1);
        }
    } else {
        // Space-separated format: ygo_bulk_search '{...}' '{...}' cols=...
        for (const arg of args){
            if (arg.startsWith('{') || arg.startsWith('[')) {
                // This is a JSON filter
                try {
                    const parsed = JSON.parse(arg);
                    if (typeof parsed === 'object' && parsed !== null) {
                        filters.push(parsed);
                    }
                } catch (e) {
                    console.error('Invalid filter JSON:', arg);
                    process.exit(1);
                }
            } else if (arg.includes('=')) {
                // Parse options
                const [key, value] = arg.split('=', 2);
                if (key === 'cols') {
                    parsedOptions.cols = value.split(',');
                } else if (key === 'mode') {
                    parsedOptions.mode = value;
                } else if (key === 'includeRuby') {
                    parsedOptions.includeRuby = value !== 'false';
                } else if (key === 'flagAutoPend') {
                    parsedOptions.flagAutoPend = value !== 'false';
                } else if (key === 'flagAutoSupply') {
                    parsedOptions.flagAutoSupply = value !== 'false';
                } else if (key === 'flagAutoModify') {
                    parsedOptions.flagAutoModify = value !== 'false';
                } else if (key === 'flagAllowWild') {
                    parsedOptions.flagAllowWild = value !== 'false';
                } else if (key === 'flagNearly') {
                    parsedOptions.flagNearly = value === 'true';
                } else {
                    // Pass through unknown options
                    passthroughOptions.push(arg);
                }
            } else {
                passthroughOptions.push(arg);
            }
        }
    }
    if (filters.length === 0) {
        console.error('At least one filter JSON object is required');
        process.exit(1);
    }
    // Convert filters to query format expected by bulk-search-cards
    const queries = filters.map((filter)=>({
            filter,
            ...parsedOptions
        }));
    const bulkSearchArgs = [
        JSON.stringify(queries),
        ...passthroughOptions
    ];
    const proc = spawn('node', [
        scriptPath,
        ...bulkSearchArgs
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
