import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';
export async function findProjectRoot(startDir) {
    const __dirname = startDir || path.dirname(url.fileURLToPath(import.meta.url));
    let projectRoot = __dirname;
    while(true){
        if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
            const pkg = JSON.parse(await fs.promises.readFile(path.join(projectRoot, 'package.json'), 'utf8'));
            if (pkg.name === 'ygo-search-card-mcp') {
                return projectRoot;
            }
        }
        const parentDir = path.dirname(projectRoot);
        if (parentDir === projectRoot) {
            throw new Error('Could not find project root containing package.json with name "ygo-search-card-mcp".');
        }
        projectRoot = parentDir;
    }
}
