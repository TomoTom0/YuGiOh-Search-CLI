import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const searchScript = path.join(__dirname, '..', 'src', 'search-cards.ts')

function runSearch(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', searchScript, ...args])
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

describe('search-cards', () => {
  it('should search by exact card name', async () => {
    const result = await runSearch([
      JSON.stringify({ name: '青眼の白龍' }),
      'cols=name,cardId'
    ])

    expect(result.exitCode).toBe(0)
    const cards = JSON.parse(result.stdout)
    expect(cards).toBeInstanceOf(Array)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]).toHaveProperty('name', '青眼の白龍')
    expect(cards[0]).toHaveProperty('cardId')
  })

  it('should search with wildcard', async () => {
    const result = await runSearch([
      JSON.stringify({ name: 'ブルーアイズ*' }),
      'cols=name,cardId',
      'flagAllowWild=true'
    ])

    expect(result.exitCode).toBe(0)
    const cards = JSON.parse(result.stdout)
    expect(cards).toBeInstanceOf(Array)
    expect(cards.length).toBeGreaterThan(1)
    expect(cards.some((c: any) => c.name.includes('ブルーアイズ'))).toBe(true)
  })

  it('should search by cardId', async () => {
    const result = await runSearch([
      JSON.stringify({ cardId: '4007' }),
      'cols=name,cardId'
    ])

    expect(result.exitCode).toBe(0)
    const cards = JSON.parse(result.stdout)
    expect(cards).toBeInstanceOf(Array)
    expect(cards.length).toBe(1)
    expect(cards[0]).toHaveProperty('cardId', '4007')
    expect(cards[0]).toHaveProperty('name', '青眼の白龍')
  })

  it('should use partial mode', async () => {
    const result = await runSearch([
      JSON.stringify({ name: '青眼' }),
      'cols=name',
      'mode=partial'
    ])

    expect(result.exitCode).toBe(0)
    const cards = JSON.parse(result.stdout)
    expect(cards).toBeInstanceOf(Array)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every((c: any) => c.name.includes('青眼'))).toBe(true)
  })

  it('should normalize name with flagAutoModify', async () => {
    const result = await runSearch([
      JSON.stringify({ name: 'あおめ の しろ りゅう' }),
      'cols=name',
      'flagAutoModify=true'
    ])

    expect(result.exitCode).toBe(0)
    const cards = JSON.parse(result.stdout)
    expect(cards).toBeInstanceOf(Array)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.some((c: any) => c.name === '青眼の白龍')).toBe(true)
  })

  it('should return empty array for non-existent card', async () => {
    const result = await runSearch([
      JSON.stringify({ name: 'ThisCardDoesNotExist12345' }),
      'cols=name'
    ])

    expect(result.exitCode).toBe(0)
    const cards = JSON.parse(result.stdout)
    expect(cards).toBeInstanceOf(Array)
    expect(cards.length).toBe(0)
  })

  it('should auto-include ruby when requesting name', async () => {
    const result = await runSearch([
      JSON.stringify({ name: '青眼の白龍' }),
      'cols=name',
      'flagAutoRuby=true'
    ])

    expect(result.exitCode).toBe(0)
    const cards = JSON.parse(result.stdout)
    expect(cards[0]).toHaveProperty('name')
    expect(cards[0]).toHaveProperty('ruby')
  })

  it('should search multiple attributes', async () => {
    const result = await runSearch([
      JSON.stringify({ attribute: '光', race: 'ドラゴン族' }),
      'cols=name,attribute,race'
    ])

    expect(result.exitCode).toBe(0)
    const cards = JSON.parse(result.stdout)
    expect(cards).toBeInstanceOf(Array)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every((c: any) => c.attribute === '光' && c.race === 'ドラゴン族')).toBe(true)
  })
})
