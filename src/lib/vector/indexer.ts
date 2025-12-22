import * as lancedb from '@lancedb/lancedb';
import * as fs from 'fs/promises';
import { generateEmbeddings } from './embeddings.js';
import { getVectorDbPath } from '../config/paths.js';

const getDbPath = () => getVectorDbPath();

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

  const existingTables = await db.tableNames();

  // 既存テーブルがあれば削除
  if (existingTables.includes(tableName)) {
    console.error(`既存テーブルを削除: ${tableName}`);
    await db.dropTable(tableName);
  }

  // 新しいテーブルを作成（一時テーブルを使わずに直接作成）
  console.error(`テーブルを作成: ${tableName}`);
  await db.createTable(tableName, vectorRecords as any);

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
