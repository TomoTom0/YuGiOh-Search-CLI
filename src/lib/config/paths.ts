/**
 * パス解決モジュール
 * YGO_SEARCH_WORKDIR環境変数をサポートし、データディレクトリのパスを解決する
 */

import * as path from 'node:path'
import * as os from 'node:os'
import * as fs from 'node:fs'

/**
 * ワークディレクトリを取得
 *
 * 優先順位:
 * 1. YGO_SEARCH_WORKDIR環境変数
 * 2. ~/.local/ygo-search/
 *
 * @returns ワークディレクトリの絶対パス
 */
export function getWorkDir(): string {
  const envWorkDir = process.env.YGO_SEARCH_WORKDIR

  if (envWorkDir) {
    // チルダ展開
    if (envWorkDir.startsWith('~/')) {
      return path.join(os.homedir(), envWorkDir.slice(2))
    }
    return path.resolve(envWorkDir)
  }

  // デフォルト: ~/.local/ygo-search/
  return path.join(os.homedir(), '.local', 'ygo-search')
}

/**
 * dataディレクトリのパスを取得
 *
 * @returns dataディレクトリの絶対パス
 */
export function getDataDir(): string {
  return path.join(getWorkDir(), 'data')
}

/**
 * TSVファイルのパスを取得
 *
 * @param filename TSVファイル名 (例: 'cards-all.tsv', 'faq-all.tsv')
 * @returns TSVファイルの絶対パス
 */
export function getTsvPath(filename: string): string {
  return path.join(getDataDir(), 'tsv', filename)
}

/**
 * Vector DBの基本ディレクトリを取得
 * LanceDB接続時に使用する
 *
 * @returns Vector DB基本ディレクトリの絶対パス
 */
export function getVectorDbPath(): string {
  return path.join(getWorkDir(), 'data', 'vector')
}

/**
 * Vector DBディレクトリのパスを取得（非推奨）
 * 個別のVector DBテーブルのパスが必要な場合に使用
 *
 * @param dbName Vector DB名 (例: 'cards.lance', 'faqs.lance')
 * @returns Vector DBディレクトリの絶対パス
 * @deprecated LanceDBはテーブル名で管理するため、通常は不要
 */
export function getVectorDbTablePath(dbName: string): string {
  return path.join(getVectorDbPath(), dbName)
}

/**
 * tmpディレクトリのパスを取得
 *
 * @returns tmpディレクトリの絶対パス
 */
export function getTmpDir(): string {
  return path.join(getWorkDir(), 'tmp')
}

/**
 * tmpファイルのパスを取得
 *
 * @param filename tmpファイル名 (例: 'cards_for_vectordb.jsonl')
 * @returns tmpファイルの絶対パス
 */
export function getTmpPath(filename: string): string {
  return path.join(getTmpDir(), filename)
}

/**
 * ディレクトリを作成（存在しない場合のみ）
 *
 * @param dirPath ディレクトリパス
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

/**
 * ワークディレクトリの初期化
 * 必要なディレクトリ構造を作成する
 */
export function initWorkDir(): void {
  const workDir = getWorkDir()

  ensureDir(path.join(workDir, 'data', 'tsv'))
  ensureDir(path.join(workDir, 'data', 'vector'))
  ensureDir(path.join(workDir, 'tmp'))
}
