#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import url from "url";
import fs from "fs/promises";
import type { SearchFAQParams } from "./search-faq.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const cliScript = path.join(__dirname, "search-cards.js");
const bulkScript = path.join(__dirname, "bulk-search-cards.js");
const extractAndSearchScript = path.join(__dirname, "extract-and-search-cards.js");
const judgeAndReplaceScript = path.join(__dirname, "judge-and-replace.js");
const formatConverterScript = path.join(__dirname, "format-converter.js");
const faqSearchScript = path.join(__dirname, "search-faq.js");
const npxPath = "node";
const tsxArgs = [cliScript];

const server = new McpServer({ name: "ygo-search-card", version: "1.0.0" });

// Helper function to generate timestamp-based filename
function generateTimestampFilename(extension: string = "jsonl"): string {
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/:/g, "-"); // 2025-11-17T21-12-02
  return `ygo-search-${timestamp}.${extension}`;
}

// Helper function to resolve output path
function resolveOutputPath(outputPath?: string, outputDir?: string): string | null {
  if (!outputPath && !outputDir) return null;
  
  const dir = outputDir || process.env.YGO_OUTPUT_DIR || process.cwd();
  const filename = outputPath || generateTimestampFilename();
  
  // If outputPath is absolute, use it directly
  if (outputPath && path.isAbsolute(outputPath)) {
    return outputPath;
  }
  
  return path.join(dir, filename);
}

// Helper function to save output to file
async function saveOutput(outputPath: string, content: string): Promise<void> {
  const dir = path.dirname(outputPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(outputPath, content, "utf-8");
}

// Helper function to execute and optionally save output
async function executeAndSave(
  cliArgs: string[],
  outputPath?: string,
  outputDir?: string
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const result = await executeCLI(cliArgs);
  const resolvedPath = resolveOutputPath(outputPath, outputDir);

  if (resolvedPath) {
    const outputContent = result.content[0]?.text;
    if (outputContent) {
      await saveOutput(resolvedPath, outputContent);
      return {
        content: [{
          type: "text" as const,
          text: `${outputContent}\n\n✅ Saved to: ${resolvedPath}`
        }]
      };
    }
  }
  
  return result;
}

// Helper function to execute CLI script with type safety
async function executeCLI(args: string[]): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(npxPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    
    child.stdout?.on("data", (b: Buffer) => (out += b.toString()));
    child.stderr?.on("data", (b: Buffer) => (err += b.toString()));
    
    child.on("error", (error: Error) => {
      resolve({ content: [{ type: "text" as const, text: `spawn error: ${error.message}` }] });
    });
    
    child.on("close", (code: number | null) => {
      if (code !== 0) {
        resolve({ content: [{ type: "text" as const, text: `error: ${err || `exit ${code}`}` }] });
        return;
      }
      resolve({ content: [{ type: "text", text: out }] });
    });
  });
}

// Available field names
const availableFields = [
  "cardType", "name", "ruby", "cardId", "ciid", "imgs",
  "text", "attribute", "levelType", "levelValue", "race", "monsterTypes",
  "atk", "def", "linkMarkers", "pendulumScale", "pendulumText",
  "isExtraDeck", "spellEffectType", "trapEffectType",
  "supplementInfo", "supplementDate", "pendulumSupplementInfo", "pendulumSupplementDate"
];

const paramsSchema = {
  filter: z.record(z.any()).describe("Filter conditions. Example: {name: 'Blue-Eyes White Dragon'} or {text: '*destroy*'} or {text: 'destroy -\"negate\"'} (negative search)"),
  cols: z.array(z.string()).optional().describe(`Columns to return. Available: ${availableFields.join(", ")}. Use 'text' for card effects.`),
  mode: z.enum(["exact", "partial"]).optional().describe("Search mode: 'exact' (default) or 'partial' (substring match)"),
  includeRuby: z.boolean().optional().describe("Include ruby (reading) field in name searches (default: true)"),
  flagAutoPend: z.boolean().optional().describe("Auto-include pendulumText/pendulumSupplementInfo for pendulum monsters when requesting 'text' (default: true)"),
  flagAutoSupply: z.boolean().optional().describe("Always auto-include supplementInfo even if empty (default: true)"),
  flagAutoRuby: z.boolean().optional().describe("Auto-include ruby when requesting 'name' (default: true)"),
  flagAutoModify: z.boolean().optional().describe("Normalize name for flexible matching (default: true)"),
  flagAllowWild: z.boolean().optional().describe("Treat * as wildcard in name and text searches (default: true). Negative search: -(space|　)-\"phrase\" excludes cards with phrase"),
  flagNearly: z.boolean().optional().describe("Fuzzy matching - not yet implemented (default: false)"),
  outputPath: z.string().optional().describe("Optional: Filename or absolute path to save results. If absolute path, used directly. Otherwise combined with outputDir/YGO_OUTPUT_DIR env var/cwd. If omitted with outputDir, auto-generates timestamp filename like 'ygo-search-2025-11-17T21-12-02.jsonl'."),
  outputDir: z.string().optional().describe("Optional: Directory to save output file. Priority: 1) This parameter, 2) YGO_OUTPUT_DIR environment variable, 3) Current directory. Creates directory if not exists. Combined with outputPath or auto-generated filename."),
};

server.tool(
  "search_cards",
  `Search Yu-Gi-Oh cards database. Available fields: name, ruby, cardId, text (card effect), attribute, race, monsterTypes, atk, def, levelValue, pendulumText, supplementInfo. Use 'text' for card effects. Supports wildcard (*) in name and text fields, and negative search: -"phrase" to exclude.`,
  paramsSchema,
  async ({ filter, cols, mode, includeRuby, flagAutoPend, flagAutoSupply, flagAutoRuby, flagAutoModify, flagAllowWild, flagNearly, outputPath, outputDir }) => {
    const args = [...tsxArgs, JSON.stringify(filter)];
    if (cols && cols.length) args.push(`cols=${cols.join(",")}`);
    args.push(`mode=${mode || "exact"}`);
    if (includeRuby === false) args.push(`includeRuby=false`);
    if (flagAutoPend === false) args.push(`flagAutoPend=false`);
    if (flagAutoSupply === false) args.push(`flagAutoSupply=false`);
    if (flagAutoRuby === false) args.push(`flagAutoRuby=false`);
    if (flagAutoModify === false) args.push(`flagAutoModify=false`);
    if (flagAllowWild === false) args.push(`flagAllowWild=false`);
    if (flagNearly === true) args.push(`flagNearly=true`);

    return executeAndSave(args, outputPath, outputDir);
  }
);

// Bulk search tool
const querySchema = {
  filter: z.record(z.any()),
  cols: z.array(z.string()).optional(),
  mode: z.enum(["exact", "partial"]).optional(),
  includeRuby: z.boolean().optional(),
  flagAutoPend: z.boolean().optional(),
  flagAutoSupply: z.boolean().optional(),
  flagAutoRuby: z.boolean().optional(),
  flagAutoModify: z.boolean().optional(),
  flagAllowWild: z.boolean().optional(),
};

const bulkParamsSchema = {
  queries: z.array(z.object(querySchema))
    .min(1)
    .max(50)
    .describe("Array of search queries (max 50). Each query has the same structure as search_cards."),
  outputPath: z.string().optional().describe("Optional: Save results to file. Filename or absolute path."),
  outputDir: z.string().optional().describe("Optional: Directory to save output file. Uses YGO_OUTPUT_DIR env var or current directory if not specified."),
};

server.tool(
  "bulk_search_cards",
  `Bulk search multiple cards at once. More efficient than calling search_cards multiple times. Returns array of result arrays.`,
  bulkParamsSchema,
  async ({ queries, outputPath, outputDir }) => {
    const args = [bulkScript, JSON.stringify(queries)];
    return executeAndSave(args, outputPath, outputDir);
  }
);

// Extract and search tool
server.tool(
  "extract_and_search_cards",
  `Extract card name patterns from text and search for them. Supports {card-name} (flexible/wildcard), 《card-name》 (exact), and {{card-name|cardId}} (by ID).`,
  {
    text: z.string().describe("Text containing card name patterns: {flexible}, 《exact》, or {{name|cardId}}"),
    outputPath: z.string().optional().describe("Optional: Save results to file. Filename or absolute path."),
    outputDir: z.string().optional().describe("Optional: Directory to save output file."),
  },
  async ({ text, outputPath, outputDir }) => {
    const args = [extractAndSearchScript, text];
    return executeAndSave(args, outputPath, outputDir);
  }
);

// Judge and replace tool
server.tool(
  "judge_and_replace_cards",
  `Extract card patterns, search, and replace them intelligently. Results: 1 match → {{name|id}}, multiple → {{` + "`query`_`name|id`_...}}, none → {{NOTFOUND_`query`}}. Warns if unprocessed patterns remain.",
  {
    text: z.string().describe("Text with card patterns: {flexible}, 《exact》. Already processed {{name|id}} patterns are preserved."),
    outputPath: z.string().optional().describe("Optional: Save results to file. Filename or absolute path."),
    outputDir: z.string().optional().describe("Optional: Directory to save output file."),
  },
  async ({ text, outputPath, outputDir }) => {
    const args = [judgeAndReplaceScript, text];
    return executeAndSave(args, outputPath, outputDir);
  }
);

// Format converter tool
server.tool(
  "convert_file_formats",
  `Convert between JSON, JSONL, JSONC, and YAML formats. Supports multiple file conversions in one call.`,
  {
    conversions: z.array(z.object({
      input: z.string().describe("Input file path (format detected from extension: .json, .jsonl, .jsonc, .yaml, .yml)"),
      output: z.string().describe("Output file path (format detected from extension)")
    })).min(1).describe("Array of conversion pairs. Each pair specifies input and output file paths.")
  },
  async ({ conversions }) => {
    const args = [
      formatConverterScript,
      ...conversions.map(c => `${c.input}:${c.output}`)
    ];
    return executeCLI(args);
  }
);

// FAQ search tool
server.tool(
  "search_faq",
  `Search Yu-Gi-Oh! FAQ database by FAQ ID, card ID, card name/spec, question text, or answer text. Returns FAQs with embedded card information for all cards mentioned in the Q&A.`,
  {
    faqId: z.number().optional().describe("Search by specific FAQ ID"),
    cardId: z.number().optional().describe("Search FAQs that mention this card ID"),
    cardName: z.string().optional().describe("Search FAQs by card name (supports wildcards with *)"),
    cardFilter: z.record(z.any()).optional().describe("Search FAQs by card specifications (e.g., {race:'dragon', levelValue:'8', atk:'3000'})"),
    question: z.string().optional().describe("Search in question text (supports wildcards with *)"),
    answer: z.string().optional().describe("Search in answer text (supports wildcards with *)"),
    limit: z.number().default(50).describe("Maximum number of results (default: 50)"),
    flagAllowWild: z.boolean().default(true).describe("Enable wildcard search with * (default: true)"),
    fcols: z.string().optional().describe("FAQ columns to output (comma-separated: faqId,question,answer,updatedAt)"),
    cols: z.string().optional().describe("Card columns to output (comma-separated: cardId,name,atk,def,race,text,etc.)"),
    format: z.enum(['json', 'csv', 'tsv', 'jsonl']).optional().describe("Output format (default: json)"),
    random: z.boolean().optional().describe("Randomly select from results"),
    range: z.string().optional().describe("Filter by FAQ ID range (e.g., '100-200')"),
    all: z.boolean().optional().describe("Return all results (use with range)"),
    outputPath: z.string().optional().describe("Output file path (e.g., 'result.json' or 'result.jsonl')"),
    outputDir: z.string().optional().describe("Output directory (defaults to current directory or YGO_OUTPUT_DIR)")
  },
  async ({ faqId, cardId, cardName, cardFilter, question, answer, limit, flagAllowWild, fcols, cols, format, random, range, all, outputPath, outputDir }) => {
    const params: Partial<SearchFAQParams> = {
      limit,
      flagAllowWild,
      faqId,
      cardId,
      cardName,
      cardFilter,
      question,
      answer
    };
    
    // Remove undefined properties
    Object.keys(params).forEach(key => {
      if (params[key as keyof SearchFAQParams] === undefined) {
        delete params[key as keyof SearchFAQParams];
      }
    });
    
    const args = [faqSearchScript, JSON.stringify(params)];
    if (fcols) args.push('--fcol', fcols);
    if (cols) args.push('--col', cols);
    if (format) args.push('--format', format);
    if (random) args.push('--random');
    if (range) args.push('--range', range);
    if (all) args.push('--all');
    
    return executeAndSave(args, outputPath, outputDir);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on("SIGINT", async () => { await server.close(); process.exit(0); });
process.on("SIGTERM", async () => { await server.close(); process.exit(0); });

console.error("ygo-search-card MCP server started");


