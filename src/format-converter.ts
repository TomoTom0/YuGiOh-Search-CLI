#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { parse as parseJsonc } from "jsonc-parser";

// Supported formats
type Format = "json" | "jsonl" | "jsonc" | "yaml";

interface ConversionPair {
  input: string;
  output: string;
}

// Detect format from file extension
function detectFormat(filename: string): Format {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".jsonl") return "jsonl";
  if (ext === ".jsonc") return "jsonc";
  if (ext === ".yaml" || ext === ".yml") return "yaml";
  return "json";
}

// Parse input based on format
async function parseFile(filePath: string, format: Format): Promise<any> {
  const content = await fs.readFile(filePath, "utf-8");
  
  switch (format) {
    case "json":
      return JSON.parse(content);
      
    case "jsonc":
      return parseJsonc(content);
      
    case "jsonl":
      return content
        .split("\n")
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
      
    case "yaml":
      return yaml.load(content);
      
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

// Format output based on format
function formatOutput(data: any, format: Format): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2);
      
    case "jsonc":
      // Add header comment
      return `// Generated at ${new Date().toISOString()}\n${JSON.stringify(data, null, 2)}`;
      
    case "jsonl":
      const items = Array.isArray(data) ? data : [data];
      return items.map(item => JSON.stringify(item)).join("\n");
      
    case "yaml":
      return yaml.dump(data);
      
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

// Main conversion function
async function convertFile(inputPath: string, outputPath: string): Promise<void> {
  const inputFormat = detectFormat(inputPath);
  const outputFormat = detectFormat(outputPath);
  
  console.error(`Converting ${inputPath} (${inputFormat}) → ${outputPath} (${outputFormat})`);
  
  const data = await parseFile(inputPath, inputFormat);
  const output = formatOutput(data, outputFormat);
  
  const outputDir = path.dirname(outputPath);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(outputPath, output, "utf-8");
  
  console.error(`✅ Converted successfully`);
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
