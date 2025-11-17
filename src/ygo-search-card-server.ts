#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import url from "url";
import type { Card } from "./types/card.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const cliScript = path.join(__dirname, "search-cards.ts");
const bulkScript = path.join(__dirname, "bulk-search-cards.ts");
const extractAndSearchScript = path.join(__dirname, "extract-and-search-cards.ts");
const judgeAndReplaceScript = path.join(__dirname, "judge-and-replace.ts");
const npxPath = "npx";
const tsxArgs = ["tsx", cliScript];

const server = new McpServer({ name: "ygo-search-card", version: "1.0.0" });

interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

// Helper function to execute CLI script with type safety
async function executeCLI(args: string[]): Promise<{ content: Array<{ type: string; text: string }> }> {
  return new Promise((resolve) => {
    const child: ChildProcess = spawn(npxPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    
    child.stdout?.on("data", (b: Buffer) => (out += b.toString()));
    child.stderr?.on("data", (b: Buffer) => (err += b.toString()));
    
    child.on("close", (code: number | null) => {
      if (code !== 0) {
        resolve({ content: [{ type: "text", text: `error: ${err || `exit ${code}`}` }] });
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
};

server.tool(
  "search_cards",
  `Search Yu-Gi-Oh cards database. Available fields: name, ruby, cardId, text (card effect), attribute, race, monsterTypes, atk, def, levelValue, pendulumText, supplementInfo. Use 'text' for card effects. Supports wildcard (*) in name and text fields, and negative search: -"phrase" to exclude.`,
  paramsSchema,
  async ({ filter, cols, mode, includeRuby, flagAutoPend, flagAutoSupply, flagAutoRuby, flagAutoModify, flagAllowWild, flagNearly }) => {
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

    return executeCLI(args);
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
    .describe("Array of search queries (max 50). Each query has the same structure as search_cards.")
};

server.tool(
  "bulk_search_cards",
  `Bulk search multiple cards at once. More efficient than calling search_cards multiple times. Returns array of result arrays.`,
  bulkParamsSchema,
  async ({ queries }) => {
    const args = ["tsx", bulkScript, JSON.stringify(queries)];
    return executeCLI(args);
  }
);

// Extract and search tool
server.tool(
  "extract_and_search_cards",
  `Extract card name patterns from text and search for them. Supports {card-name} (flexible/wildcard), 《card-name》 (exact), and {{card-name|cardId}} (by ID).`,
  {
    text: z.string().describe("Text containing card name patterns: {flexible}, 《exact》, or {{name|cardId}}")
  },
  async ({ text }) => {
    const args = ["tsx", extractAndSearchScript, text];
    return executeCLI(args);
  }
);

// Judge and replace tool
server.tool(
  "judge_and_replace_cards",
  `Extract card patterns, search, and replace them intelligently. Results: 1 match → {{name|id}}, multiple → {{` + "`query`_`name|id`_...}}, none → {{NOTFOUND_`query`}}. Warns if unprocessed patterns remain.",
  {
    text: z.string().describe("Text with card patterns: {flexible}, 《exact》. Already processed {{name|id}} patterns are preserved.")
  },
  async ({ text }) => {
    const args = ["tsx", judgeAndReplaceScript, text];
    return executeCLI(args);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);

process.on("SIGINT", async () => { await server.close(); process.exit(0); });
process.on("SIGTERM", async () => { await server.close(); process.exit(0); });

console.error("ygo-search-card MCP server started");


