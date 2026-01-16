#!/usr/bin/env node
import fs from 'fs/promises'
import path from 'path'
import url from 'url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const DOCS_DIR = path.join(__dirname, '..', '..', 'docs', 'api')

interface DocEntry {
  name: string
  path: string
  type: 'function' | 'interface' | 'type' | 'module'
}

async function findDocs(): Promise<DocEntry[]> {
  const entries: DocEntry[] = []

  try {
    const files = await fs.readdir(DOCS_DIR, { recursive: true })

    for (const file of files) {
      if (typeof file !== 'string' || !file.endsWith('.md')) continue

      const fullPath = path.join(DOCS_DIR, file)
      const stat = await fs.stat(fullPath)
      if (!stat.isFile()) continue

      // ファイル名から名前を抽出
      const basename = path.basename(file, '.md')

      // ディレクトリ構造から型を推測
      let type: DocEntry['type'] = 'module'
      if (file.includes('functions/') || file.includes('Function/')) {
        type = 'function'
      } else if (file.includes('interfaces/') || file.includes('Interface/')) {
        type = 'interface'
      } else if (file.includes('types/') || file.includes('Type/')) {
        type = 'type'
      }

      entries.push({
        name: basename,
        path: fullPath,
        type
      })
    }
  } catch (err) {
    // ドキュメントが存在しない場合
    return []
  }

  return entries
}

async function showDoc(docPath: string): Promise<void> {
  try {
    const content = await fs.readFile(docPath, 'utf-8')
    console.log(content)
  } catch (err) {
    console.error(`Error: Could not read document: ${docPath}`)
    process.exit(1)
  }
}

async function listDocs(entries: DocEntry[]): Promise<void> {
  if (entries.length === 0) {
    console.log('No documentation found. Please run: bun run docs')
    return
  }

  const grouped = entries.reduce((acc, entry) => {
    if (!acc[entry.type]) acc[entry.type] = []
    acc[entry.type].push(entry.name)
    return acc
  }, {} as Record<string, string[]>)

  console.log('Available Documentation:\n')

  const order: Array<DocEntry['type']> = ['function', 'interface', 'type', 'module']
  for (const type of order) {
    if (!grouped[type] || grouped[type].length === 0) continue

    console.log(`${type.charAt(0).toUpperCase() + type.slice(1)}s:`)
    for (const name of grouped[type].sort()) {
      console.log(`  - ${name}`)
    }
    console.log()
  }

  console.log('Usage:')
  console.log('  ygo_docs <name>        Show documentation for a function, interface, or type')
  console.log('  ygo_docs list          List all available documentation')
  console.log('  ygo_docs --help        Show this help message')
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`ygo_docs - View API documentation

Usage:
  ygo_docs                Show main documentation (README)
  ygo_docs <name>         Show documentation for a function, interface, or type
  ygo_docs list           List all available documentation
  ygo_docs --help         Show this help message

Examples:
  ygo_docs searchCards    Show searchCards function documentation
  ygo_docs Card           Show Card interface documentation
  ygo_docs list           List all available items

Note: If documentation is not found, run 'bun run docs' to generate it.
`)
    process.exit(0)
  }

  const entries = await findDocs()

  if (args[0] === 'list') {
    await listDocs(entries)
    return
  }

  // 引数なしの場合はREADMEを表示
  if (args.length === 0) {
    const readmePath = path.join(DOCS_DIR, 'README.md')
    try {
      await showDoc(readmePath)
      return
    } catch {
      console.log('Documentation not found. Please run: bun run docs')
      process.exit(1)
    }
  }

  // 名前で検索
  const query = args[0]
  const found = entries.find(e =>
    e.name.toLowerCase() === query.toLowerCase() ||
    e.name === query
  )

  if (found) {
    await showDoc(found.path)
  } else {
    console.error(`Error: Documentation for '${query}' not found.`)
    console.error('\nAvailable items:')
    console.error(entries.map(e => `  - ${e.name}`).join('\n'))
    console.error('\nRun "ygo_docs list" to see all available documentation.')
    process.exit(1)
  }
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
