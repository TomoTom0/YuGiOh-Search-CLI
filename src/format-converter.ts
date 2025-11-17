#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";

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

// Remove comments from JSONC
function removeComments(jsonc: string): string {
  // Remove single-line comments
  let result = jsonc.replace(/\/\/.*$/gm, "");
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  return result;
}

// Parse input based on format
async function parseFile(filePath: string, format: Format): Promise<any> {
  const content = await fs.readFile(filePath, "utf-8");
  
  switch (format) {
    case "json":
      return JSON.parse(content);
      
    case "jsonc":
      return JSON.parse(removeComments(content));
      
    case "jsonl":
      return content
        .split("\n")
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
      
    case "yaml":
      // Simple YAML parser (supports basic structures)
      const lines = content.split("\n");
      const result: any[] = [];
      let currentObj: any = null;
      let indent = 0;
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        
        const currentIndent = line.length - line.trimStart().length;
        
        // Array item
        if (trimmed.startsWith("- ")) {
          if (currentObj && currentIndent <= indent) {
            result.push(currentObj);
            currentObj = null;
          }
          
          const keyValue = trimmed.slice(2);
          if (keyValue.includes(":")) {
            if (!currentObj) {
              currentObj = {};
              indent = currentIndent;
            }
            const [key, ...valueParts] = keyValue.split(":");
            const value = valueParts.join(":").trim();
            currentObj[key.trim()] = parseYamlValue(value);
          }
        } else if (trimmed.includes(":")) {
          // Key-value pair
          if (currentObj && currentIndent <= indent) {
            result.push(currentObj);
            currentObj = {};
            indent = currentIndent;
          }
          if (!currentObj) {
            currentObj = {};
            indent = currentIndent;
          }
          const [key, ...valueParts] = trimmed.split(":");
          const value = valueParts.join(":").trim();
          currentObj[key.trim()] = parseYamlValue(value);
        }
      }
      
      if (currentObj) {
        result.push(currentObj);
      }
      
      return result.length === 1 ? result[0] : result;
      
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

// Parse YAML value
function parseYamlValue(value: string): any {
  if (!value) return null;
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  const num = Number(value);
  if (!isNaN(num)) return num;
  return value;
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
      return convertToYaml(data, 0);
      
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

// Convert data to YAML
function convertToYaml(data: any, indent: number = 0): string {
  const spaces = " ".repeat(indent);
  
  if (Array.isArray(data)) {
    return data.map(item => {
      if (typeof item === "object" && item !== null) {
        const entries = Object.entries(item);
        if (entries.length === 0) return `${spaces}- {}`;
        const first = entries[0];
        let result = `${spaces}- ${first[0]}: ${formatYamlValue(first[1])}`;
        for (let i = 1; i < entries.length; i++) {
          const [key, value] = entries[i];
          result += `\n${spaces}  ${key}: ${formatYamlValue(value)}`;
        }
        return result;
      }
      return `${spaces}- ${formatYamlValue(item)}`;
    }).join("\n");
  }
  
  if (typeof data === "object" && data !== null) {
    return Object.entries(data)
      .map(([key, value]) => `${spaces}${key}: ${formatYamlValue(value)}`)
      .join("\n");
  }
  
  return `${spaces}${formatYamlValue(data)}`;
}

// Format YAML value
function formatYamlValue(value: any): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    // Quote if contains special characters
    if (value.includes(":") || value.includes("#") || value.includes("\n")) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatYamlValue).join(", ")}]`;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
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
