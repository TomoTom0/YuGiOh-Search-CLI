import * as path from 'path';
import * as os from 'os';

/**
 * ホームディレクトリを展開する
 */
function expandHome(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * ワークディレクトリを取得
 * 環境変数YGO_SEARCH_WORKDIRが設定されていればそれを使用
 * 未設定の場合はデフォルト: ~/.local/ygo-search/
 */
export function getWorkDir(): string {
  const envWorkDir = process.env.YGO_SEARCH_WORKDIR;

  if (envWorkDir) {
    return expandHome(envWorkDir);
  }

  // デフォルト: ~/.local/ygo-search/
  return path.join(os.homedir(), '.local', 'ygo-search');
}

/**
 * TSVファイルのパスを取得
 */
export function getTsvPath(filename: string): string {
  return path.join(getWorkDir(), 'data', 'tsv', filename);
}

/**
 * Vector DBディレクトリのパスを取得
 */
export function getVectorDbPath(): string {
  return path.join(getWorkDir(), 'data', 'vector');
}

/**
 * tmpファイルのパスを取得
 */
export function getTmpPath(filename: string): string {
  return path.join(getWorkDir(), 'tmp', filename);
}

/**
 * tmpディレクトリのパスを取得
 */
export function getTmpDir(): string {
  return path.join(getWorkDir(), 'tmp');
}

/**
 * データディレクトリのパスを取得
 */
export function getDataDir(): string {
  return path.join(getWorkDir(), 'data');
}
