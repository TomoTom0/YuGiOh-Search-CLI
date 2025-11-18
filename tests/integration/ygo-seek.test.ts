import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import path from 'path'

function runYgoSeek(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '../../dist/ygo-seek.js')
    const proc = spawn('node', [scriptPath, ...args])
    
    let stdout = ''
    let stderr = ''
    
    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })
    
    proc.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode || 0 })
    })
  })
}

describe('ygo-seek integration tests', () => {
  it('should return random cards with default options', async () => {
    const result = await runYgoSeek(['--max=5'])
    expect(result.exitCode).toBe(0)
    
    const cards = JSON.parse(result.stdout)
    expect(Array.isArray(cards)).toBe(true)
    expect(cards.length).toBeLessThanOrEqual(5)
    
    for (const card of cards) {
      expect(card).toHaveProperty('cardId')
      expect(card).toHaveProperty('name')
    }
  })
  
  it('should filter by cardId range', async () => {
    const result = await runYgoSeek(['--range=4000-4010', '--all'])
    expect(result.exitCode).toBe(0)
    
    const cards = JSON.parse(result.stdout)
    expect(Array.isArray(cards)).toBe(true)
    
    for (const card of cards) {
      const cardId = parseInt(card.cardId)
      expect(cardId).toBeGreaterThanOrEqual(4000)
      expect(cardId).toBeLessThanOrEqual(4010)
    }
  })
  
  it('should output CSV format', async () => {
    const result = await runYgoSeek(['--max=3', '--format=csv', '--col=cardId,name'])
    expect(result.exitCode).toBe(0)
    
    const lines = result.stdout.trim().split('\n')
    expect(lines.length).toBeGreaterThan(1) // header + at least 1 row
    expect(lines[0]).toBe('"cardId","name"')
    
    // Check CSV format
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]).toMatch(/"[^"]+","[^"]+"/)
    }
  })
  
  it('should output TSV format', async () => {
    const result = await runYgoSeek(['--max=3', '--format=tsv', '--col=cardId,name'])
    expect(result.exitCode).toBe(0)
    
    const lines = result.stdout.trim().split('\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines[0]).toBe('cardId\tname')
    
    // Check TSV format
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i]).toContain('\t')
    }
  })
  
  it('should output JSONL format', async () => {
    const result = await runYgoSeek(['--max=3', '--format=jsonl'])
    expect(result.exitCode).toBe(0)
    
    const lines = result.stdout.trim().split('\n')
    expect(lines.length).toBeGreaterThan(0)
    
    for (const line of lines) {
      const card = JSON.parse(line)
      expect(card).toHaveProperty('cardId')
      expect(card).toHaveProperty('name')
    }
  })
  
  it('should respect --no-random option', async () => {
    const result1 = await runYgoSeek(['--range=4000-4020', '--no-random', '--max=5'])
    const result2 = await runYgoSeek(['--range=4000-4020', '--no-random', '--max=5'])
    
    expect(result1.exitCode).toBe(0)
    expect(result2.exitCode).toBe(0)
    
    // Without randomness, results should be identical
    expect(result1.stdout).toBe(result2.stdout)
  })
  
  it('should retrieve specific columns', async () => {
    const result = await runYgoSeek(['--max=2', '--col=cardId,name,atk,def'])
    expect(result.exitCode).toBe(0)
    
    const cards = JSON.parse(result.stdout)
    expect(cards.length).toBeGreaterThan(0)
    
    for (const card of cards) {
      expect(card).toHaveProperty('cardId')
      expect(card).toHaveProperty('name')
      expect(card).toHaveProperty('atk')
      expect(card).toHaveProperty('def')
      expect(Object.keys(card).length).toBe(4)
    }
  })
  
  it('should fail when --all without --range', async () => {
    const result = await runYgoSeek(['--all'])
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('--all requires --range')
  })
  
  it('should handle invalid range format', async () => {
    const result = await runYgoSeek(['--range=invalid'])
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('Invalid range')
  })
})
