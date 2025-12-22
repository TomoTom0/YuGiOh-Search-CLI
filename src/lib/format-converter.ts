/**
 * フォーマット変換機能
 * @packageDocumentation
 */

import fs from "fs/promises"
import path from "path"
import yaml from "js-yaml"
import { parse as parseJsonc } from "jsonc-parser"

/**
 * サポートされるフォーマット
 */
export type Format = "json" | "jsonl" | "jsonc" | "yaml"

/**
 * ファイル拡張子からフォーマットを検出する
 *
 * @param filename - ファイル名
 * @returns 検出されたフォーマット
 *
 * @example
 * ```typescript
 * import { detectFormat } from 'ygo-search'
 *
 * const format = detectFormat('data.jsonl')
 * // 'jsonl'
 * ```
 */
export function detectFormat(filename: string): Format {
  const ext = path.extname(filename).toLowerCase()
  if (ext === ".jsonl") return "jsonl"
  if (ext === ".jsonc") return "jsonc"
  if (ext === ".yaml" || ext === ".yml") return "yaml"
  return "json"
}

/**
 * フォーマット文字列をパースする
 *
 * @param content - パース対象の文字列
 * @param format - 入力フォーマット
 * @returns パースされたデータ
 *
 * @example
 * ```typescript
 * import { parseFormatString } from 'ygo-search'
 *
 * const data = parseFormatString('{"key": "value"}', 'json')
 * // { key: 'value' }
 *
 * const jsonlData = parseFormatString('{"a":1}\n{"b":2}', 'jsonl')
 * // [{ a: 1 }, { b: 2 }]
 * ```
 */
export function parseFormatString(content: string, format: Format): any {
  switch (format) {
    case "json":
      return JSON.parse(content)

    case "jsonc":
      return parseJsonc(content)

    case "jsonl":
      return content
        .split("\n")
        .filter(line => line.trim())
        .map(line => JSON.parse(line))

    case "yaml":
      return yaml.load(content)

    default:
      throw new Error(`Unsupported format: ${format}`)
  }
}

/**
 * ファイルを読み込んでパースする
 *
 * @param filePath - ファイルパス
 * @param format - 入力フォーマット
 * @returns パースされたデータ
 *
 * @example
 * ```typescript
 * import { parseFormatFile } from 'ygo-search'
 *
 * const data = await parseFormatFile('data.json', 'json')
 * ```
 */
export async function parseFormatFile(filePath: string, format: Format): Promise<any> {
  const content = await fs.readFile(filePath, "utf-8")
  return parseFormatString(content, format)
}

/**
 * データを指定フォーマットに変換する
 *
 * @param data - 変換対象のデータ
 * @param format - 出力フォーマット
 * @returns フォーマット済み文字列
 *
 * @example
 * ```typescript
 * import { formatOutput } from 'ygo-search'
 *
 * const jsonString = formatOutput({ key: 'value' }, 'json')
 * // '{\n  "key": "value"\n}'
 *
 * const yamlString = formatOutput({ key: 'value' }, 'yaml')
 * // 'key: value\n'
 * ```
 */
export function formatOutput(data: any, format: Format): string {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2)

    case "jsonc":
      // Add header comment
      return `// Generated at ${new Date().toISOString()}\n${JSON.stringify(data, null, 2)}`

    case "jsonl":
      const items = Array.isArray(data) ? data : [data]
      return items.map(item => JSON.stringify(item)).join("\n")

    case "yaml":
      return yaml.dump(data)

    default:
      throw new Error(`Unsupported format: ${format}`)
  }
}

/**
 * ファイル間でフォーマット変換を実行する
 *
 * @param inputPath - 入力ファイルパス
 * @param outputPath - 出力ファイルパス
 *
 * @example
 * ```typescript
 * import { convertFormatFile } from 'ygo-search'
 *
 * // JSON -> JSONL変換
 * await convertFormatFile('input.json', 'output.jsonl')
 *
 * // YAML -> JSON変換
 * await convertFormatFile('config.yaml', 'config.json')
 * ```
 */
export async function convertFormatFile(inputPath: string, outputPath: string): Promise<void> {
  const inputFormat = detectFormat(inputPath)
  const outputFormat = detectFormat(outputPath)

  const data = await parseFormatFile(inputPath, inputFormat)
  const output = formatOutput(data, outputFormat)

  const outputDir = path.dirname(outputPath)
  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(outputPath, output, "utf-8")
}
