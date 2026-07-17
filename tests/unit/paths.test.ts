import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'
import {
  getWorkDir,
  getDataDir,
  getTsvPath,
  getVectorDbPath,
  getTmpDir,
  initWorkDir,
} from '../../src/lib/config/paths.js'

// TASK-25: getWorkDir() の cwd フォールバック廃止の回帰テスト。
// update 実行のたび実行場所に data/ が散らばっていたバグを固定する。

describe('getWorkDir', () => {
  const origWorkDir = process.env.YGO_SEARCH_WORKDIR

  afterEach(() => {
    if (origWorkDir === undefined) {
      delete process.env.YGO_SEARCH_WORKDIR
    } else {
      process.env.YGO_SEARCH_WORKDIR = origWorkDir
    }
  })

  it('YGO_SEARCH_WORKDIR 未設定時は ~/.local/ygo-search を返す（cwd にフォールバックしない）', () => {
    delete process.env.YGO_SEARCH_WORKDIR
    const expected = path.join(os.homedir(), '.local', 'ygo-search')
    expect(getWorkDir()).toBe(expected)
    // 回帰: 実行場所（cwd）を返さないことを明示
    expect(getWorkDir()).not.toBe(process.cwd())
  })

  it('YGO_SEARCH_WORKDIR に絶対パスを指定すると resolve して返す', () => {
    process.env.YGO_SEARCH_WORKDIR = '/tmp/custom-ygo-abs'
    expect(getWorkDir()).toBe(path.resolve('/tmp/custom-ygo-abs'))
  })

  it('YGO_SEARCH_WORKDIR に相対パスを指定すると cwd 基準で resolve する', () => {
    process.env.YGO_SEARCH_WORKDIR = './relative-data'
    expect(getWorkDir()).toBe(path.resolve('./relative-data'))
  })

  it('YGO_SEARCH_WORKDIR の ~/ を homedir に展開する', () => {
    process.env.YGO_SEARCH_WORKDIR = '~/my-ygo'
    expect(getWorkDir()).toBe(path.join(os.homedir(), 'my-ygo'))
  })
})

describe('paths 派生関数（デフォルト workDir 基準）', () => {
  beforeEach(() => {
    delete process.env.YGO_SEARCH_WORKDIR
  })

  it('getDataDir は <workDir>/data', () => {
    expect(getDataDir()).toBe(path.join(os.homedir(), '.local', 'ygo-search', 'data'))
  })

  it('getTsvPath は <workDir>/data/tsv/<file>', () => {
    expect(getTsvPath('cards-all.tsv')).toBe(
      path.join(os.homedir(), '.local', 'ygo-search', 'data', 'tsv', 'cards-all.tsv')
    )
  })

  it('getVectorDbPath は <workDir>/data/vector', () => {
    expect(getVectorDbPath()).toBe(path.join(os.homedir(), '.local', 'ygo-search', 'data', 'vector'))
  })

  it('getTmpDir は <workDir>/tmp', () => {
    expect(getTmpDir()).toBe(path.join(os.homedir(), '.local', 'ygo-search', 'tmp'))
  })
})

describe('initWorkDir', () => {
  let tmpBase: string

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ygo-paths-test-'))
    process.env.YGO_SEARCH_WORKDIR = tmpBase
  })

  afterEach(() => {
    delete process.env.YGO_SEARCH_WORKDIR
    fs.rmSync(tmpBase, { recursive: true, force: true })
  })

  it('data/tsv, data/vector, tmp を作成する', () => {
    initWorkDir()
    expect(fs.existsSync(path.join(tmpBase, 'data', 'tsv'))).toBe(true)
    expect(fs.existsSync(path.join(tmpBase, 'data', 'vector'))).toBe(true)
    expect(fs.existsSync(path.join(tmpBase, 'tmp'))).toBe(true)
  })

  it('既存ディレクトリがあってもエラーにならない（冪等）', () => {
    initWorkDir()
    expect(() => initWorkDir()).not.toThrow()
  })
})
