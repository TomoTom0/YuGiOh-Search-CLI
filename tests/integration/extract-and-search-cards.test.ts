import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const extractScript = path.join(__dirname, '..', '..', 'dist', 'extract-and-search-cards.js')

function runExtractSearch(text: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('node', [extractScript, text])
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

describe('extract-and-search-cards', () => {
  it('should extract and search flexible pattern', async () => {
    const result = await runExtractSearch('Use {青眼の白龍} in deck')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data).toHaveProperty('cards')
    expect(data.cards).toBeInstanceOf(Array)
    expect(data.cards.length).toBe(1)
    expect(data.cards[0]).toHaveProperty('pattern', '{青眼の白龍}')
    expect(data.cards[0]).toHaveProperty('type', 'flexible')
    expect(data.cards[0]).toHaveProperty('results')
    expect(data.cards[0].results.length).toBeGreaterThan(0)
  })

  it('should extract and search exact pattern', async () => {
    const result = await runExtractSearch('Use 《青眼の白龍》 card')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.cards.length).toBe(1)
    expect(data.cards[0]).toHaveProperty('pattern', '《青眼の白龍》')
    expect(data.cards[0]).toHaveProperty('type', 'exact')
    expect(data.cards[0].results.length).toBeGreaterThan(0)
  })

  it('should extract and search cardId pattern', async () => {
    const result = await runExtractSearch('Use {{青眼の白龍|4007}} in combo')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.cards.length).toBe(1)
    expect(data.cards[0]).toHaveProperty('pattern', '{{青眼の白龍|4007}}')
    expect(data.cards[0]).toHaveProperty('type', 'cardId')
    expect(data.cards[0]).toHaveProperty('query', '4007')
    expect(data.cards[0].results.length).toBe(1)
    expect(data.cards[0].results[0]).toHaveProperty('cardId', '4007')
  })

  it('should handle wildcard in flexible pattern', async () => {
    const result = await runExtractSearch('Search for {ブルーアイズ*} cards')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.cards.length).toBe(1)
    expect(data.cards[0]).toHaveProperty('type', 'flexible')
    expect(data.cards[0].results.length).toBeGreaterThan(1)
  })

  it('should extract multiple patterns', async () => {
    const result = await runExtractSearch('Use {ブルーアイズ*} and 《青眼の白龍》 and {{青眼の究極竜|2129}}')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.cards.length).toBe(3)
    expect(data.cards[0]).toHaveProperty('type', 'cardId')
    expect(data.cards[1]).toHaveProperty('type', 'exact')
    expect(data.cards[2]).toHaveProperty('type', 'flexible')
  })

  it('should return empty array when no patterns found', async () => {
    const result = await runExtractSearch('No patterns here')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data).toHaveProperty('cards')
    expect(data.cards).toEqual([])
  })

  it('should handle nested braces correctly', async () => {
    const result = await runExtractSearch('Use {{青眼の白龍|4007}} not {inside}')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.cards.length).toBe(2)
    expect(data.cards.some((c: any) => c.type === 'cardId')).toBe(true)
    expect(data.cards.some((c: any) => c.type === 'flexible')).toBe(true)
  })

  it('should handle empty results for non-existent cards', async () => {
    const result = await runExtractSearch('Use {NonExistentCard12345} in deck')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.cards.length).toBe(1)
    expect(data.cards[0].results).toEqual([])
  })
})
