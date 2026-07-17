import { describe, it, expect } from 'vitest'
import { spawn } from 'child_process'
import path from 'path'

// CLI(src/cli/ygo_search.ts)の --help/-h が引数の位置に関わらず正しく動作し、
// 実処理（特に vector setup のインデックス再構築）を誤実行しないことを検証する。
// 過去に vector setup で --help チェック自体が欠落しており、
// `ygo-search vector setup --help` が本物のインデックス再構築を実行してしまうバグがあった
// (docs/dev/feature/m3-t1-t2-vector-search-embedding-decisions.md 参照、TASK-29 で commander へ移行して解消)。
function runYgoSearch(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '../../dist/cli/ygo_search.js')
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

describe('ygo_search CLI --help/-h handling', () => {
  it('shows top-level help with no arguments', async () => {
    const result = await runYgoSearch([])
    expect(result.stdout).toContain('Usage: ygo-search')
    expect(result.stdout).toContain('Commands:')
  })

  it('shows top-level help for --help and -h', async () => {
    for (const flag of ['--help', '-h', 'help']) {
      const result = await runYgoSearch([flag])
      expect(result.stdout).toContain('Usage: ygo-search')
    }
  })

  describe('help shown regardless of flag position, real processing not triggered', () => {
    const cases: Array<{ name: string; args: string[]; mustContain: string }> = [
      { name: 'card (leading)', args: ['card', '--help'], mustContain: 'カード検索' },
      { name: 'card (trailing, after filter)', args: ['card', '--name', 'foo', '--help'], mustContain: 'Usage: ygo-search card' },
      { name: 'bulk', args: ['bulk', '--help'], mustContain: '一括実行' },
      { name: 'convert', args: ['convert', '--help'], mustContain: 'フォーマット変換' },
      { name: 'faq', args: ['faq', '--help'], mustContain: 'FAQ' },
      { name: 'extract (leading)', args: ['extract', '--help'], mustContain: 'カード名抽出' },
      { name: 'extract (trailing, after text)', args: ['extract', 'some text', '--help'], mustContain: 'Usage: ygo-search extract' },
      { name: 'replace (trailing)', args: ['replace', 'some text', '--help'], mustContain: 'Usage: ygo-search replace' },
      { name: 'vector (no subcommand)', args: ['vector', '--help'], mustContain: 'Vector DB' },
      // 最重要回帰テスト: vector setup --help は実際のインデックス再構築を実行してはいけない
      { name: 'vector setup (leading)', args: ['vector', 'setup', '--help'], mustContain: 'Usage: ygo-search vector setup' },
      { name: 'vector setup (with type arg)', args: ['vector', 'setup', 'cards', '--help'], mustContain: 'Usage: ygo-search vector setup' },
      { name: 'vector search (trailing, after query)', args: ['vector', 'search', 'query text', '--help'], mustContain: 'Usage: ygo-search vector search' },
      { name: 'vector setup-generic (trailing, after --table)', args: ['vector', 'setup-generic', '--table', 'x', '--help'], mustContain: 'Usage: ygo-search vector setup-generic' },
      { name: 'docs', args: ['docs', '--help'], mustContain: 'APIドキュメント' },
      { name: 'update', args: ['update', '--help'], mustContain: 'Usage: ygo-search update' }
    ]

    for (const { name, args, mustContain } of cases) {
      it(`${name}: ${JSON.stringify(args)}`, async () => {
        const result = await runYgoSearch(args)
        expect(result.stdout).toContain(mustContain)
        // ヘルプ表示時は実処理エラー（データ未検出等）が発生しないはず
        expect(result.stderr).not.toContain('インデックス構築中にエラー')
        expect(result.stderr).not.toContain('検索エラー')
      }, 15000)
    }
  })

  it('seek --help delegates to ygo-seek.js own help (position-independent)', async () => {
    const leading = await runYgoSearch(['seek', '--help'])
    expect(leading.stdout).toContain('Usage: ygo_seek')

    const trailing = await runYgoSearch(['seek', '--max', '3', '--help'])
    expect(trailing.stdout).toContain('Usage: ygo_seek')
  })

  it('vector setup --help does not perform real indexing (regression guard)', async () => {
    const result = await runYgoSearch(['vector', 'setup', '--help'])
    expect(result.stdout).not.toContain('インデックスを構築中')
    expect(result.stderr).not.toContain('インデックスを構築中')
    expect(result.stdout).toContain('Usage: ygo-search vector setup')
  }, 15000)

  it('backward-compat: omitting the explicit "card" command still works', async () => {
    const result = await runYgoSearch(['--name', '青眼の白龍'])
    const cards = result.stdout
      .trim()
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0].name).toBe('青眼の白龍')
  })

  it('bare "columns" without explicit "card" command shows column reference', async () => {
    const result = await runYgoSearch(['columns'])
    expect(result.stdout).toContain('利用可能なカラム一覧')
  })
})
