import * as lancedb from '@lancedb/lancedb';
import { generateEmbedding } from './embeddings.js';
import { getVectorDbPath } from '../config/paths.js';

const getDbPath = () => getVectorDbPath();

export interface SearchResult {
  id: string;
  text: string;
  metadata: Record<string, any>;
  score: number;
}

export interface VectorSearchOptions {
  limit?: number;
  distanceType?: 'l2' | 'cosine' | 'dot';
  threshold?: number;
  filter?: Record<string, any>;
  exclude?: {
    ids?: string[];
    faqIds?: string[];
    categories?: string[];
  };
}

export interface CardSearchOptions extends VectorSearchOptions {
  cardType?: 'monster' | 'spell' | 'trap';
  attribute?: string;
  level?: { min?: number; max?: number };
  race?: string;
}

export interface FaqSearchOptions extends VectorSearchOptions {
  faqId?: string;
}

function buildWhereClause(filter: Record<string, any>): string | null {
  const conditions: string[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null) continue;

    if (typeof value === 'string') {
      conditions.push(`metadata.${key} = "${value}"`);
    } else if (typeof value === 'number') {
      conditions.push(`metadata.${key} = ${value}`);
    } else if (typeof value === 'boolean') {
      conditions.push(`metadata.${key} = ${value}`);
    } else if (typeof value === 'object' && 'min' in value) {
      if (value.min !== undefined) {
        conditions.push(`metadata.${key} >= ${value.min}`);
      }
      if (value.max !== undefined) {
        conditions.push(`metadata.${key} <= ${value.max}`);
      }
    }
  }

  return conditions.length > 0 ? conditions.join(' AND ') : null;
}

function buildExcludeClause(
  exclude: NonNullable<VectorSearchOptions['exclude']>,
  tableName: string
): string | null {
  const conditions: string[] = [];

  if (exclude.ids && exclude.ids.length > 0) {
    const idList = exclude.ids.map(id => `"${id}"`).join(', ');
    conditions.push(`id NOT IN (${idList})`);
  }

  if (exclude.faqIds && exclude.faqIds.length > 0 && tableName === 'faqs') {
    const faqIdList = exclude.faqIds.map(id => `${id}`).join(', ');
    conditions.push(`metadata.faqId NOT IN (${faqIdList})`);
  }

  if (exclude.categories && exclude.categories.length > 0) {
    const categoryList = exclude.categories.map(cat => `"${cat}"`).join(', ');
    conditions.push(`metadata.category NOT IN (${categoryList})`);
  }

  return conditions.length > 0 ? conditions.join(' AND ') : null;
}

export async function searchTable(
  tableName: string,
  query: string | number[],
  options: VectorSearchOptions = {}
): Promise<SearchResult[]> {
  const {
    limit = 10,
    distanceType = 'cosine',
    threshold,
    filter,
    exclude,
  } = options;

  const db = await lancedb.connect(getDbPath());
  const table = await db.openTable(tableName);

  // queryが文字列なら embedding を生成、配列ならそのまま使用
  const queryVector = typeof query === 'string'
    ? await generateEmbedding(query)
    : query;

  let search = table
    .vectorSearch(queryVector)
    .distanceType(distanceType)
    .limit(limit);

  const whereClauses: string[] = [];

  if (filter) {
    const filterClause = buildWhereClause(filter);
    if (filterClause) whereClauses.push(filterClause);
  }

  if (exclude) {
    const excludeClause = buildExcludeClause(exclude, tableName);
    if (excludeClause) whereClauses.push(excludeClause);
  }

  if (whereClauses.length > 0) {
    search = search.where(whereClauses.join(' AND '));
  }

  const results = await search.toArray();

  let filtered = results.map((r: any) => ({
    id: r.id,
    text: r.text,
    metadata: r.metadata,
    score: r._distance,
  }));

  if (threshold !== undefined) {
    filtered = filtered.filter(r => r.score <= threshold);
  }

  return filtered;
}

export async function searchCards(
  query: string,
  options: number | CardSearchOptions = {}
): Promise<SearchResult[]> {
  if (typeof options === 'number') {
    options = { limit: options };
  }

  const { cardType, attribute, level, race, ...baseOptions } = options;

  const filter: Record<string, any> = {};
  if (cardType) filter.cardType = cardType;
  if (attribute) filter.attribute = attribute;
  if (race) filter.race = race;
  if (level) filter.level = level;

  return searchTable('cards', query, {
    ...baseOptions,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });
}

export async function searchFaqs(
  query: string,
  options: number | FaqSearchOptions = {}
): Promise<SearchResult[]> {
  if (typeof options === 'number') {
    options = { limit: options };
  }

  const { faqId, ...baseOptions } = options;

  const filter: Record<string, any> = {};
  if (faqId) filter.faqId = faqId;

  return searchTable('faqs', query, {
    ...baseOptions,
    filter: Object.keys(filter).length > 0 ? filter : undefined,
  });
}

export async function listTables(): Promise<string[]> {
  const db = await lancedb.connect(getDbPath());
  const tableNames = await db.tableNames();
  return tableNames;
}

export async function searchAll(
  query: string,
  options: number | VectorSearchOptions = {}
): Promise<Record<string, SearchResult[]>> {
  if (typeof options === 'number') {
    options = { limit: options };
  }

  // Embedding modelを事前に初期化し、embeddingを一度だけ生成
  const { initEmbeddings, generateEmbedding } = await import('./embeddings.js');
  await initEmbeddings();
  const queryVector = await generateEmbedding(query);

  // 全テーブルを取得
  const allTables = await listTables();

  // 全テーブルに対して並列検索（embeddingを再利用）
  const results = await Promise.all(
    allTables.map(async (tableName) => {
      try {
        const tableResults = await searchTable(tableName, queryVector, options as VectorSearchOptions);
        return { tableName, results: tableResults };
      } catch (error) {
        // テーブルが存在しないか、エラーが発生した場合はスキップ
        console.error(`Warning: Failed to search table ${tableName}:`, (error as Error).message);
        return { tableName, results: [] };
      }
    })
  );

  // 結果をオブジェクトに変換
  const resultMap: Record<string, SearchResult[]> = {};
  for (const { tableName, results: tableResults } of results) {
    if (tableResults.length > 0) {
      resultMap[tableName] = tableResults;
    }
  }

  return resultMap;
}
