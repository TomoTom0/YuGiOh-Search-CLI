import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs/promises';
import { generateEmbeddings } from './embeddings.js';
import { getVectorDbPath } from '../config/paths.js';

const getDbPath = () => getVectorDbPath();

const TEMP_PREFIX = '_tmp_';

export interface VectorRecord {
  id: string;
  text: string;
  metadata: Record<string, any>;
}

export interface VectorRecordWithEmbedding {
  id: string;
  text: string;
  vector: number[];
  metadata: Record<string, any>;
}

export async function cleanupTempTables(): Promise<void> {
  try {
    const db = await lancedb.connect(getDbPath());
    const tables = await db.tableNames();

    for (const table of tables) {
      if (table.startsWith(TEMP_PREFIX)) {
        console.error(`一時テーブルを削除: ${table}`);
        await db.dropTable(table);
      }
    }
  } catch (e) {
    // DBが存在しない場合は無視
  }
}

export async function createIndex(
  tableName: string,
  records: VectorRecord[]
): Promise<void> {
  console.error(`テーブルを作成中: ${tableName}`);
  console.error(`レコード数: ${records.length}`);

  const texts = records.map(r => r.text);
  console.error('Embeddingを生成中...');
  const vectors = await generateEmbeddings(texts);

  const vectorRecords: VectorRecordWithEmbedding[] = records.map((r, i) => ({
    id: r.id,
    text: r.text,
    vector: vectors[i],
    metadata: r.metadata,
  }));

  console.error('LanceDBに接続中...');
  const db = await lancedb.connect(getDbPath());

  const tempTableName = `${TEMP_PREFIX}${tableName}`;

  const existingTables = await db.tableNames();

  if (existingTables.includes(tempTableName)) {
    console.error(`既存の一時テーブルを削除: ${tempTableName}`);
    await db.dropTable(tempTableName);
  }

  console.error(`一時テーブルを作成: ${tempTableName}`);
  await db.createTable(tempTableName, vectorRecords as any);

  if (existingTables.includes(tableName)) {
    console.error(`既存テーブルを削除: ${tableName}`);
    await db.dropTable(tableName);
  }

  console.error(`テーブルをリネーム: ${tempTableName} -> ${tableName}`);
  await db.createTable(tableName, vectorRecords as any);
  await db.dropTable(tempTableName);

  console.error(`✓ インデックス作成完了: ${tableName} (${records.length}件)`);
}

export async function indexFromJsonl(
  tableName: string,
  jsonlPath: string
): Promise<void> {
  console.error(`JSONLファイルを読み込み中: ${jsonlPath}`);
  const content = await fs.readFile(jsonlPath, 'utf-8');
  const lines = content.trim().split('\n');

  const records: VectorRecord[] = lines.map(line => {
    const data = JSON.parse(line);
    return {
      id: data.id,
      text: data.text,
      metadata: data.metadata || {},
    };
  });

  await createIndex(tableName, records);
}
