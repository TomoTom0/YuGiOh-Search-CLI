#!/usr/bin/env node
import { convertFormatFile, detectFormat } from "./lib/format-converter.js"

interface ConversionPair {
  input: string
  output: string
}

async function convertFile(inputPath: string, outputPath: string): Promise<void> {
  const inputFormat = detectFormat(inputPath)
  const outputFormat = detectFormat(outputPath)

  console.error(`Converting ${inputPath} (${inputFormat}) → ${outputPath} (${outputFormat})`)

  await convertFormatFile(inputPath, outputPath)

  console.error(`✅ Converted successfully`)
}

// CLI entry point
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error("Usage: format-converter.ts input1:output1 [input2:output2 ...]");
    console.error("");
    console.error("Example:");
    console.error("  format-converter.ts data.json:data.jsonl data.yaml:output.json");
    console.error("");
    console.error("Supported formats: .json, .jsonl, .jsonc, .yaml/.yml");
    process.exit(1);
  }
  
  const pairs: ConversionPair[] = args.map(arg => {
    const [input, output] = arg.split(":");
    if (!input || !output) {
      throw new Error(`Invalid format: ${arg}. Expected input:output`);
    }
    return { input, output };
  });
  
  for (const pair of pairs) {
    await convertFile(pair.input, pair.output);
  }
  
  console.log(JSON.stringify({
    success: true,
    converted: pairs.length,
    pairs: pairs
  }, null, 2));
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
