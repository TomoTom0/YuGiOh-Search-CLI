/**
 * CLI docs command - API documentation viewer
 */
import fs from 'fs/promises';
import path from 'path';

export interface DocEntry {
  name: string;
  path: string;
  type: 'function' | 'interface' | 'type' | 'module';
}

/**
 * Find all documentation markdown files
 */
export async function findDocs(docsDir: string): Promise<DocEntry[]> {
  const entries: DocEntry[] = [];

  try {
    const files = await fs.readdir(docsDir, { recursive: true });

    for (const file of files) {
      if (typeof file !== 'string' || !file.endsWith('.md')) continue;

      const fullPath = path.join(docsDir, file);
      const stat = await fs.stat(fullPath);
      if (!stat.isFile()) continue;

      const basename = path.basename(file, '.md');

      let type: DocEntry['type'] = 'module';
      if (file.includes('functions/') || file.includes('Function/')) {
        type = 'function';
      } else if (file.includes('interfaces/') || file.includes('Interface/')) {
        type = 'interface';
      } else if (file.includes('types/') || file.includes('Type/') || file.includes('type-aliases/')) {
        type = 'type';
      }

      entries.push({
        name: basename,
        path: fullPath,
        type
      });
    }
  } catch (err) {
    return [];
  }

  return entries;
}

/**
 * Show documentation content
 * @throws Error if file cannot be read
 */
export async function showDoc(docPath: string): Promise<void> {
  try {
    const content = await fs.readFile(docPath, 'utf-8');
    console.log(content);
  } catch (err) {
    throw new Error(`Could not read document: ${docPath}`);
  }
}

/**
 * List all available documentation
 */
export async function listDocs(entries: DocEntry[]): Promise<void> {
  if (entries.length === 0) {
    console.log('No documentation found. Please run: bun run docs');
    return;
  }

  const grouped = entries.reduce((acc, entry) => {
    if (!acc[entry.type]) acc[entry.type] = [];
    acc[entry.type].push(entry.name);
    return acc;
  }, {} as Record<string, string[]>);

  console.log('Available Documentation:\n');

  const order: Array<DocEntry['type']> = ['function', 'interface', 'type', 'module'];
  for (const type of order) {
    if (!grouped[type] || grouped[type].length === 0) continue;

    console.log(`${type.charAt(0).toUpperCase() + type.slice(1)}s:`);
    for (const name of grouped[type].sort()) {
      console.log(`  - ${name}`);
    }
    console.log();
  }

  console.log('Usage:');
  console.log('  ygo_search docs <name>   Show documentation for a function, interface, or type');
  console.log('  ygo_search docs list     List all available documentation');
  console.log('  ygo_search docs --help   Show this help message');
}

/**
 * Find a documentation entry by name
 */
export function findDocByName(entries: DocEntry[], query: string): DocEntry | undefined {
  return entries.find(e =>
    e.name.toLowerCase() === query.toLowerCase() ||
    e.name === query
  );
}
