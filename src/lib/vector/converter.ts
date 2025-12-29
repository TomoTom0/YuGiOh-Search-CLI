import * as fs from 'fs/promises';

export interface VectorRecord {
  id: string;
  text: string;
  metadata: Record<string, any>;
}

interface CardRow {
  cardType: string;
  name: string;
  nameModified: string;
  ruby: string;
  cardId: string;
  ciid: string;
  imgs: string;
  text: string;
  biko: string;
  isNotLegalForOfficial: string;
  attribute: string;
  levelType: string;
  levelValue: string;
  race: string;
  monsterTypes: string;
  atk: string;
  def: string;
  linkMarkers: string;
  pendulumScale: string;
  pendulumText: string;
  isExtraDeck: string;
  spellEffectType: string;
  trapEffectType: string;
}

interface DetailRow {
  cardId: string;
  cardName: string;
  supplementInfo: string;
  supplementDate: string;
  pendulumSupplementInfo: string;
  pendulumSupplementDate: string;
}

interface FaqRow {
  faqId: string;
  question: string;
  answer: string;
  updatedAt: string;
}

function parseTsvLine(line: string, headers: string[]): Record<string, string> {
  const values = line.split('\t');
  const record: Record<string, string> = {};
  headers.forEach((header, index) => {
    const value = values[index] || '';
    record[header] = value.replace(/\\n/g, '\n');
  });
  return record;
}

function formatCardType(cardType: string, monsterTypes: string, spellEffectType: string, trapEffectType: string): string {
  if (cardType === 'monster') {
    try {
      const types = JSON.parse(monsterTypes);
      if (Array.isArray(types) && types.length > 0) {
        return types.map((t: string) => {
          const typeMap: Record<string, string> = {
            'normal': '通常',
            'effect': '効果',
            'fusion': '融合',
            'ritual': '儀式',
            'synchro': 'シンクロ',
            'xyz': 'エクシーズ',
            'pendulum': 'ペンデュラム',
            'link': 'リンク',
            'tuner': 'チューナー',
            'spirit': 'スピリット',
            'union': 'ユニオン',
            'gemini': 'デュアル',
            'flip': 'リバース',
            'toon': 'トゥーン'
          };
          return typeMap[t] || t;
        }).join('・') + 'モンスター';
      }
    } catch (e) {
      // JSON parse failed
    }
    return 'モンスター';
  } else if (cardType === 'spell') {
    const typeMap: Record<string, string> = {
      'normal': '通常',
      'continuous': '永続',
      'equip': '装備',
      'field': 'フィールド',
      'quickPlay': '速攻',
      'ritual': '儀式'
    };
    return (typeMap[spellEffectType] || '') + '魔法';
  } else if (cardType === 'trap') {
    const typeMap: Record<string, string> = {
      'normal': '通常',
      'continuous': '永続',
      'counter': 'カウンター'
    };
    return (typeMap[trapEffectType] || '') + '罠';
  }
  return cardType;
}

function formatMonsterStatus(card: CardRow): string {
  const parts: string[] = [];

  if (card.attribute) {
    parts.push(card.attribute);
  }

  if (card.race) {
    parts.push(card.race);
  }

  if (card.levelType && card.levelValue) {
    const levelTypeMap: Record<string, string> = {
      'level': '星',
      'rank': 'ランク',
      'link': 'リンク'
    };
    const prefix = levelTypeMap[card.levelType] || card.levelType;
    parts.push(`${prefix}${card.levelValue}`);
  }

  if (card.atk !== '' && card.def !== '') {
    parts.push(`攻${card.atk}`);
    parts.push(`守${card.def}`);
  }

  return parts.join(' / ');
}

export function convertCardToVectorRecord(card: CardRow, detail?: DetailRow): VectorRecord {
  const textParts: string[] = [];

  textParts.push(`【カード名】 ${card.name}`);

  const cardTypeStr = formatCardType(card.cardType, card.monsterTypes, card.spellEffectType, card.trapEffectType);
  textParts.push(`【分類】 ${cardTypeStr}`);

  if (card.cardType === 'monster') {
    const status = formatMonsterStatus(card);
    if (status) {
      textParts.push(`【ステータス】 ${status}`);
    }
  }

  if (card.text) {
    textParts.push(`【テキスト】\n${card.text}`);
  }

  if (card.pendulumText && card.pendulumText !== 'false') {
    textParts.push(`【Pスケール効果】\n${card.pendulumText}`);
  }

  if (detail?.supplementInfo) {
    textParts.push(`【補足】\n${detail.supplementInfo}`);
  }

  if (detail?.pendulumSupplementInfo) {
    textParts.push(`【Pスケール補足】\n${detail.pendulumSupplementInfo}`);
  }

  const metadata: Record<string, any> = {
    cardId: parseInt(card.cardId, 10),
    cardType: card.cardType,
  };

  if (card.cardType === 'monster') {
    if (card.atk !== '') metadata.atk = parseInt(card.atk, 10);
    if (card.def !== '') metadata.def = parseInt(card.def, 10);
    if (card.attribute) metadata.attribute = card.attribute;
    if (card.race) metadata.race = card.race;
    if (card.levelType) metadata.levelType = card.levelType;
    if (card.levelValue) metadata.levelValue = parseInt(card.levelValue, 10);
  } else if (card.cardType === 'spell' && card.spellEffectType) {
    metadata.spellEffectType = card.spellEffectType;
  } else if (card.cardType === 'trap' && card.trapEffectType) {
    metadata.trapEffectType = card.trapEffectType;
  }

  return {
    id: `card-${card.cardId}`,
    text: textParts.join('\n'),
    metadata,
  };
}

export function convertFaqToVectorRecord(faq: FaqRow): VectorRecord {
  const textParts: string[] = [];

  textParts.push(`# 質問\n${faq.question}`);
  textParts.push(`\n# 回答\n${faq.answer}`);

  const metadata: Record<string, any> = {
    faqId: parseInt(faq.faqId, 10),
  };

  if (faq.updatedAt) {
    metadata.updatedAt = faq.updatedAt;
  }

  return {
    id: `faq-${faq.faqId}`,
    text: textParts.join('\n'),
    metadata,
  };
}

export async function convertCardsToJsonl(
  cardsTsvPath: string,
  detailTsvPath: string,
  outputPath: string
): Promise<number> {
  const cardsContent = await fs.readFile(cardsTsvPath, 'utf-8');
  const cardsLines = cardsContent.trim().split('\n');

  if (cardsLines.length === 0) {
    throw new Error('Cards TSV file is empty');
  }

  const cardsHeaders = cardsLines[0].split('\t');
  const cardsMap = new Map<string, CardRow>();

  for (let i = 1; i < cardsLines.length; i++) {
    const row = parseTsvLine(cardsLines[i], cardsHeaders) as unknown as CardRow;
    cardsMap.set(row.cardId, row);
  }

  const detailContent = await fs.readFile(detailTsvPath, 'utf-8');
  const detailLines = detailContent.trim().split('\n');

  const detailHeaders = detailLines[0].split('\t');
  const detailMap = new Map<string, DetailRow>();

  for (let i = 1; i < detailLines.length; i++) {
    const row = parseTsvLine(detailLines[i], detailHeaders) as unknown as DetailRow;
    detailMap.set(row.cardId, row);
  }

  const records: VectorRecord[] = [];

  for (const [cardId, card] of cardsMap) {
    const detail = detailMap.get(cardId);
    const record = convertCardToVectorRecord(card, detail);
    records.push(record);
  }

  const jsonlLines = records.map(r => JSON.stringify(r));
  await fs.writeFile(outputPath, jsonlLines.join('\n') + '\n', 'utf-8');

  return records.length;
}

export async function convertFaqsToJsonl(
  tsvPath: string,
  outputPath: string
): Promise<number> {
  const content = await fs.readFile(tsvPath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length === 0) {
    throw new Error('TSV file is empty');
  }

  const headers = lines[0].split('\t');
  const records: VectorRecord[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = parseTsvLine(lines[i], headers) as unknown as FaqRow;
    const record = convertFaqToVectorRecord(row);
    records.push(record);
  }

  const jsonlLines = records.map(r => JSON.stringify(r));
  await fs.writeFile(outputPath, jsonlLines.join('\n') + '\n', 'utf-8');

  return records.length;
}

// Generic data conversion

interface GenericRecord {
  id: string;
  title: string;
  text: string;
  [key: string]: any;
}

export interface GenericConversionOptions {
  excludeColumns?: string[];
  includeColumns?: string[];
}

function detectFormat(filePath: string): 'yaml' | 'jsonl' | 'json' | 'tsv' | 'csv' {
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext === 'yml' || ext === 'yaml') return 'yaml';
  if (ext === 'jsonl') return 'jsonl';
  if (ext === 'json') return 'json';
  if (ext === 'tsv') return 'tsv';
  if (ext === 'csv') return 'csv';
  throw new Error(`Unsupported file format: ${ext}`);
}

function extractRecordsFromObject(obj: any, records: GenericRecord[] = [], path: string[] = []): GenericRecord[] {
  if (typeof obj !== 'object' || obj === null) {
    return records;
  }

  // Check if this object has id, title, text
  if ('id' in obj && 'title' in obj && 'text' in obj) {
    const record = { ...obj } as GenericRecord;
    // 階層パスを追加（ルート以外の場合）
    if (path.length > 0) {
      record.path = path.join(' > ');
    }
    records.push(record);
  }

  // Recursively search in arrays and objects
  if (Array.isArray(obj)) {
    for (const item of obj) {
      extractRecordsFromObject(item, records, path);
    }
  } else {
    for (const [key, value] of Object.entries(obj)) {
      extractRecordsFromObject(value, records, [...path, key]);
    }
  }

  return records;
}

function buildGenericText(record: GenericRecord, options?: GenericConversionOptions): string {
  const textParts: string[] = [];

  // Always include title
  textParts.push(`【${record.title}】`);

  // Include path if exists (before text)
  if ('path' in record && record.path) {
    textParts.push(`【階層】\n${record.path}`);
  }

  // Always include text
  textParts.push(`【テキスト】\n${record.text}`);

  // Determine which columns to include
  const excludeCols = new Set(options?.excludeColumns || []);
  const includeCols = options?.includeColumns ? new Set(options.includeColumns) : null;

  // Validate exclusivity
  if (excludeCols.size > 0 && includeCols !== null) {
    throw new Error('Cannot specify both excludeColumns and includeColumns');
  }

  // Add other fields
  for (const [key, value] of Object.entries(record)) {
    // Skip id, title, text, path (already handled)
    if (key === 'id' || key === 'title' || key === 'text' || key === 'path') continue;

    // Apply column filtering
    if (includeCols !== null) {
      if (!includeCols.has(key)) continue;
    } else if (excludeCols.has(key)) {
      continue;
    }

    // Format value
    let valueStr: string;
    if (typeof value === 'object') {
      valueStr = JSON.stringify(value);
    } else {
      valueStr = String(value);
    }

    textParts.push(`【${key}】\n${valueStr}`);
  }

  return textParts.join('\n');
}

function convertGenericRecordToVector(record: GenericRecord, options?: GenericConversionOptions): VectorRecord {
  const text = buildGenericText(record, options);

  const metadata: Record<string, any> = { ...record };
  delete metadata.title;
  delete metadata.text;
  delete metadata.path;

  return {
    id: record.id,
    text,
    metadata,
  };
}

export async function convertGenericToJsonl(
  inputPath: string,
  outputPath: string,
  options?: GenericConversionOptions
): Promise<number> {
  const format = detectFormat(inputPath);
  const content = await fs.readFile(inputPath, 'utf-8');

  let records: GenericRecord[] = [];

  if (format === 'yaml') {
    const yaml = await import('js-yaml');
    const data = yaml.load(content);
    records = extractRecordsFromObject(data);
  } else if (format === 'jsonl') {
    const lines = content.trim().split('\n');
    for (const line of lines) {
      if (!line) continue;
      const obj = JSON.parse(line);
      const extracted = extractRecordsFromObject(obj);
      records.push(...extracted);
    }
  } else if (format === 'json') {
    const data = JSON.parse(content);
    records = extractRecordsFromObject(data);
  } else if (format === 'tsv') {
    const lines = content.trim().split('\n');
    if (lines.length === 0) throw new Error('TSV file is empty');

    const headers = lines[0].split('\t');
    if (!headers.includes('id') || !headers.includes('title') || !headers.includes('text')) {
      throw new Error('TSV must have id, title, text columns');
    }

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split('\t');
      const record: any = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });
      records.push(record as GenericRecord);
    }
  } else if (format === 'csv') {
    const lines = content.trim().split('\n');
    if (lines.length === 0) throw new Error('CSV file is empty');

    // Simple CSV parser (does not handle quoted commas)
    const headers = lines[0].split(',').map(h => h.trim());
    if (!headers.includes('id') || !headers.includes('title') || !headers.includes('text')) {
      throw new Error('CSV must have id, title, text columns');
    }

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const record: any = {};
      headers.forEach((header, index) => {
        record[header] = values[index] || '';
      });
      records.push(record as GenericRecord);
    }
  }

  // Convert to vector records
  const vectorRecords = records.map(r => convertGenericRecordToVector(r, options));

  // Write JSONL
  const jsonlLines = vectorRecords.map(r => JSON.stringify(r));
  await fs.writeFile(outputPath, jsonlLines.join('\n') + '\n', 'utf-8');

  return vectorRecords.length;
}
