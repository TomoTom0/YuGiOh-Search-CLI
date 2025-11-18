import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const judgeScript = path.join(__dirname, '..', '..', 'dist', 'judge-and-replace.js')

function runJudgeReplace(text: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('node', [judgeScript, text])
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

describe('judge-and-replace', () => {
  it('should replace exact match with {{name|id}}', async () => {
    const result = await runJudgeReplace('Use 《青眼の白龍》 card')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data).toHaveProperty('processedText')
    expect(data.processedText).toContain('{{青眼の白龍|4007}}')
    expect(data).toHaveProperty('hasUnprocessed', false)
    expect(data).toHaveProperty('warnings')
    expect(data.warnings).toEqual([])
    expect(data.processedPatterns[0]).toHaveProperty('status', 'resolved')
  })

  it('should mark multiple matches with backticks', async () => {
    const result = await runJudgeReplace('Use {ブルーアイズ*} cards')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.processedText).toMatch(/\{\{`ブルーアイズ\*`_`[^`]+\|[^`]+`/)
    expect(data).toHaveProperty('hasUnprocessed', true)
    expect(data.warnings.length).toBeGreaterThan(0)
    expect(data.processedPatterns[0]).toHaveProperty('status', 'multiple')
  })

  it('should mark not found with NOTFOUND', async () => {
    const result = await runJudgeReplace('Use {NonExistentCard12345} here')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.processedText).toContain('{{NOTFOUND_`NonExistentCard12345`}}')
    expect(data).toHaveProperty('hasUnprocessed', true)
    expect(data.warnings.some((w: string) => w.includes('no matches'))).toBe(true)
    expect(data.processedPatterns[0]).toHaveProperty('status', 'notfound')
  })

  it('should preserve already processed patterns', async () => {
    const result = await runJudgeReplace('Use {{青眼の白龍|4007}} card')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.processedText).toBe('Use {{青眼の白龍|4007}} card')
    expect(data).toHaveProperty('hasUnprocessed', false)
    expect(data.processedPatterns[0]).toHaveProperty('status', 'already_processed')
  })

  it('should handle mixed patterns', async () => {
    const result = await runJudgeReplace('Use {ブルーアイズ*} and 《青眼の白龍》 and {{青眼の究極竜|2129}}')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.processedPatterns.length).toBe(3)
    
    const alreadyProcessed = data.processedPatterns.find((p: any) => p.status === 'already_processed')
    expect(alreadyProcessed).toBeDefined()
    expect(alreadyProcessed.original).toContain('2129')

    const resolved = data.processedPatterns.find((p: any) => p.status === 'resolved')
    expect(resolved).toBeDefined()
    expect(resolved.replaced).toContain('{{青眼の白龍|4007}}')

    const multiple = data.processedPatterns.find((p: any) => p.status === 'multiple')
    expect(multiple).toBeDefined()
  })

  it('should return correct warnings for multiple and notfound', async () => {
    const result = await runJudgeReplace('Use {NonExist} and {ブルーアイズ*}')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.hasUnprocessed).toBe(true)
    expect(data.warnings.some((w: string) => w.includes('no matches'))).toBe(true)
    expect(data.warnings.some((w: string) => w.includes('multiple matches'))).toBe(true)
  })

  it('should handle text with no patterns', async () => {
    const result = await runJudgeReplace('Just plain text here')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.processedText).toBe('Just plain text here')
    expect(data.hasUnprocessed).toBe(false)
    expect(data.warnings).toEqual([])
    expect(data.processedPatterns).toEqual([])
  })

  it('should replace patterns in correct order', async () => {
    const result = await runJudgeReplace('First 《青眼の白龍》 then {ブラック・マジシャン}')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    expect(data.processedText).toContain('{{青眼の白龍|4007}}')
    expect(data.processedText).toContain('{{ブラック・マジシャン|')
    
    const firstIndex = data.processedText.indexOf('{{青眼の白龍|4007}}')
    const secondIndex = data.processedText.indexOf('{{ブラック・マジシャン|')
    expect(firstIndex).toBeLessThan(secondIndex)
  })

  it('should use backticks to distinguish from underscore in card names', async () => {
    const result = await runJudgeReplace('Use {ブルーアイズ*} here')

    expect(result.exitCode).toBe(0)
    const data = JSON.parse(result.stdout)
    
    // Should have backticks around original query and each candidate
    expect(data.processedText).toMatch(/\{\{`[^`]+`_`[^`]+`/)
    
    // Should not have underscores without backticks separating candidates
    const match = data.processedText.match(/\{\{`([^`]+)`_/)
    expect(match).not.toBeNull()
  })
})
