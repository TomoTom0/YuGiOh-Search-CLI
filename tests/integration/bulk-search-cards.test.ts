import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const bulkScript = path.join(__dirname, '..', 'src', 'bulk-search-cards.ts')

function runBulkSearch(queries: any[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', bulkScript, JSON.stringify(queries)])
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code || 0 })
    })
  })
}

function parseJSONL(jsonl: string): any[] {
  return jsonl
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
}

describe('bulk-search-cards', () => {
  it('should search multiple cards at once', async () => {
    const queries = [
      { filter: { name: '青眼の白龍' }, cols: ['name', 'cardId'] },
      { filter: { name: 'ブラック・マジシャン' }, cols: ['name', 'cardId'] },
      { filter: { cardId: '4007' }, cols: ['name'] }
    ]

    const result = await runBulkSearch(queries)

    expect(result.exitCode).toBe(0)
    const results = parseJSONL(result.stdout)
    expect(results).toBeInstanceOf(Array)
    expect(results.length).toBe(3)

    expect(results[0]).toBeInstanceOf(Array)
    expect(results[0][0]).toHaveProperty('name', '青眼の白龍')

    expect(results[1]).toBeInstanceOf(Array)
    expect(results[1][0]).toHaveProperty('name', 'ブラック・マジシャン')

    expect(results[2]).toBeInstanceOf(Array)
    expect(results[2][0]).toHaveProperty('name', '青眼の白龍')
  })

  it('should handle empty results', async () => {
    const queries = [
      { filter: { name: 'NonExistentCard12345' }, cols: ['name'] },
      { filter: { name: '青眼の白龍' }, cols: ['name'] }
    ]

    const result = await runBulkSearch(queries)

    expect(result.exitCode).toBe(0)
    const results = parseJSONL(result.stdout)
    expect(results).toBeInstanceOf(Array)
    expect(results.length).toBe(2)
    expect(results[0]).toEqual([])
    expect(results[1].length).toBeGreaterThan(0)
  })

  it('should handle wildcard searches in bulk', async () => {
    const queries = [
      { filter: { name: 'ブルーアイズ*' }, cols: ['name'], flagAllowWild: true },
      { filter: { name: '*ドラゴン' }, cols: ['name'], flagAllowWild: true }
    ]

    const result = await runBulkSearch(queries)

    expect(result.exitCode).toBe(0)
    const results = parseJSONL(result.stdout)
    expect(results).toBeInstanceOf(Array)
    expect(results.length).toBe(2)
    expect(results[0].length).toBeGreaterThan(0)
    expect(results[1].length).toBeGreaterThan(0)
  })

  it('should reject more than 50 queries', async () => {
    const queries = Array(51).fill({ filter: { name: '青眼の白龍' }, cols: ['name'] })

    const result = await runBulkSearch(queries)

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('50')
  })

  it('should handle single query', async () => {
    const queries = [
      { filter: { name: '青眼の白龍' }, cols: ['name', 'atk', 'def'] }
    ]

    const result = await runBulkSearch(queries)

    expect(result.exitCode).toBe(0)
    const results = parseJSONL(result.stdout)
    expect(results).toBeInstanceOf(Array)
    expect(results.length).toBe(1)
    expect(results[0][0]).toHaveProperty('atk')
    expect(results[0][0]).toHaveProperty('def')
  })
})
