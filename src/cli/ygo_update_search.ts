#!/usr/bin/env node
import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { getTsvPath, getDataDir, initWorkDir } from '../lib/config/paths.js'

const execAsync = promisify(exec)

interface GitHubAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  assets: GitHubAsset[]
}

// ファイルタイプの定義
type FileType = 'cards' | 'details' | 'faq'

const OUTPUT_FILES: Record<FileType, string> = {
  cards: 'cards-all.tsv',
  details: 'detail-all.tsv',
  faq: 'faq-all.tsv'
}

const EXACT_FILENAMES: Record<FileType, string> = {
  cards: 'cards-all.tsv',
  details: 'details-all.tsv',
  faq: 'faq-all.tsv'
}

const COLUMN_KEYWORDS: Record<FileType, string[]> = {
  cards: ['cardType', 'ruby', 'text', 'cardId', 'monsterTypes'],
  details: ['supplementInfo', 'pendulum', 'cardName', 'supplementDate'],
  faq: ['question', 'answer', 'faqId', 'updatedAt']
}

const SCRAPING_REPO = 'TomoTom0/YuGiOh-Scraping'
const API_URL = `https://api.github.com/repos/${SCRAPING_REPO}/releases`
const MIN_FILE_SIZE = 1000000 // 1MB

/**
 * HTTPS GET リクエストを実行
 */
function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http
    protocol.get(url, {
      headers: {
        'User-Agent': 'ygo-search-cli'
      }
    }, (res) => {
      let data = ''
      res.on('data', (chunk) => data += chunk)
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(data)
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`))
        }
      })
    }).on('error', reject)
  })
}

/**
 * ファイルをダウンロード
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https:') ? https : http
    const file = fs.createWriteStream(dest)

    protocol.get(url, {
      headers: {
        'User-Agent': 'ygo-search-cli'
      }
    }, (res) => {
      // リダイレクト処理
      if (res.statusCode === 302 || res.statusCode === 301) {
        const redirectUrl = res.headers.location
        if (!redirectUrl) {
          reject(new Error('Redirect without location'))
          return
        }
        file.close()
        downloadFile(redirectUrl, dest).then(resolve).catch(reject)
        return
      }

      if (res.statusCode !== 200) {
        file.close()
        fs.unlinkSync(dest)
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }

      res.pipe(file)
      file.on('finish', () => {
        file.close()
        resolve()
      })
    }).on('error', (err) => {
      file.close()
      fs.unlinkSync(dest)
      reject(err)
    })
  })
}

/**
 * 最新リリースの tar.gz URL を取得
 */
async function getLatestReleaseUrl(): Promise<string> {
  console.log('GitHub から最新リリース情報を取得中...')
  const response = await httpsGet(API_URL)
  const releases: GitHubRelease[] = JSON.parse(response)

  if (!releases || releases.length === 0) {
    throw new Error('リリースが見つかりませんでした')
  }

  const tarGzAsset = releases[0].assets.find(asset => asset.name.endsWith('.tar.gz'))

  if (!tarGzAsset) {
    throw new Error('最新リリースに .tar.gz ファイルが見つかりませんでした')
  }

  return tarGzAsset.browser_download_url
}

/**
 * TSV ファイルのヘッダーからファイルタイプを検出
 */
async function detectFileType(filepath: string): Promise<FileType | null> {
  const filename = path.basename(filepath)

  // 正確なファイル名マッチをチェック
  for (const [type, exactName] of Object.entries(EXACT_FILENAMES)) {
    if (filename === exactName) {
      return type as FileType
    }
  }

  // ヘッダー行を読み取り
  const content = await fs.promises.readFile(filepath, 'utf-8')
  const header = content.split('\n')[0].toLowerCase()
  const columns = header.split('\t')

  // キーワードマッチングでスコアリング
  let bestType: FileType | null = null
  let bestScore = 0

  for (const [type, keywords] of Object.entries(COLUMN_KEYWORDS)) {
    let score = 0
    for (const keyword of keywords) {
      if (columns.some(col => col.includes(keyword.toLowerCase()))) {
        score++
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestType = type as FileType
    }
  }

  // 少なくとも1つのキーワードマッチが必要
  if (bestScore < 1) {
    console.error(`エラー: ${filename} のファイルタイプを判定できませんでした`)
    return null
  }

  return bestType
}

/**
 * ファイルサイズを検証
 */
async function verifyFileSize(filepath: string): Promise<number> {
  const stats = await fs.promises.stat(filepath)
  if (stats.size < MIN_FILE_SIZE) {
    throw new Error(`ファイルサイズが小さすぎます: ${stats.size} bytes (最低 ${MIN_FILE_SIZE} bytes 必要)`)
  }
  return stats.size
}

/**
 * バイト数を人間が読める形式に変換
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex++
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`
}

/**
 * ディレクトリを再帰的に探索してTSVファイルを見つける
 */
async function findTsvFiles(dir: string): Promise<string[]> {
  const results: string[] = []
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const subResults = await findTsvFiles(fullPath)
      results.push(...subResults)
    } else if (entry.isFile() && entry.name.endsWith('.tsv')) {
      results.push(fullPath)
    }
  }

  return results
}

/**
 * メイン処理
 */
async function main() {
  try {
    console.log('=== YGO CLI - データセットアップ ===')
    console.log('')
    console.log('YuGiOh-Scraping リポジトリからカードデータをダウンロードします...')
    console.log('')

    // ワークディレクトリ（~/.local/ygo-search/ または YGO_SEARCH_WORKDIR）を初期化
    // data/tsv, data/vector, tmp を作成する
    initWorkDir()

    // TSVファイル保存先ディレクトリ
    const dataDir = path.join(getDataDir(), 'tsv')

    // 最新リリースの URL を取得
    const downloadUrl = await getLatestReleaseUrl()
    console.log(`ダウンロード URL: ${downloadUrl}`)
    console.log('')

    // 一時ディレクトリを作成
    const tempDir = await fs.promises.mkdtemp(path.join('/tmp', 'ygo-data-'))

    try {
      const tarFile = path.join(tempDir, 'ygo-data.tar.gz')

      // tar.gz をダウンロード
      console.log('tar.gz ファイルをダウンロード中...')
      await downloadFile(downloadUrl, tarFile)
      console.log('ダウンロード完了')

      // tar.gz を展開
      console.log('tar.gz ファイルを展開中...')
      await execAsync(`tar -xzf "${tarFile}" -C "${tempDir}"`)
      console.log('展開完了')

      // TSV ファイルを検出
      console.log('データファイルを検出中...')
      const tsvFiles = await findTsvFiles(tempDir)

      const detectedFiles: Partial<Record<FileType, string>> = {}

      for (const tsvFile of tsvFiles) {
        const fileType = await detectFileType(tsvFile)
        if (fileType) {
          if (detectedFiles[fileType]) {
            throw new Error(`重複したファイルタイプを検出: ${fileType}`)
          }
          detectedFiles[fileType] = tsvFile
          console.log(`  - ${fileType} を検出: ${path.basename(tsvFile)}`)
        }
      }

      // 必要なファイルが全て揃っているか確認
      console.log('')
      console.log('必要なファイルを確認中...')
      for (const requiredType of Object.keys(OUTPUT_FILES) as FileType[]) {
        if (!detectedFiles[requiredType]) {
          throw new Error(`必須ファイルが見つかりません: ${requiredType}`)
        }
      }

      // ファイルをコピー
      console.log('ファイルを data ディレクトリにコピー中...')
      for (const [fileType, sourceFile] of Object.entries(detectedFiles) as [FileType, string][]) {
        const targetName = OUTPUT_FILES[fileType]
        const targetFile = path.join(dataDir, targetName)
        await fs.promises.copyFile(sourceFile, targetFile)
        console.log(`  - ${path.basename(sourceFile)} -> ${targetName}`)
      }

      // ファイルサイズを検証
      console.log('')
      console.log('ファイルサイズを検証中...')
      for (const fileType of Object.keys(OUTPUT_FILES) as FileType[]) {
        const filename = OUTPUT_FILES[fileType]
        const filepath = path.join(dataDir, filename)
        await verifyFileSize(filepath)
      }

      console.log('')
      console.log('データファイルのダウンロードと展開が完了しました！')
      console.log('')
      console.log('ファイルの場所:')
      for (const fileType of Object.keys(OUTPUT_FILES) as FileType[]) {
        const filename = OUTPUT_FILES[fileType]
        const filepath = path.join(dataDir, filename)
        const size = (await fs.promises.stat(filepath)).size
        console.log(`  - ${filepath} (${formatBytes(size)})`)
      }
      console.log('')
      console.log('以下のコマンドで検索できます:')
      console.log('  ygo-search \'{"name":"*青眼*"}\'  # ワイルドカード検索')
      console.log('  ygo-search \'{"name":"青眼の白龍"}\'  # 完全一致')
      console.log('')

    } finally {
      // 一時ディレクトリをクリーンアップ
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    }

    // 成功時は正常終了
    process.exit(0)

  } catch (error) {
    console.error('エラー:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
