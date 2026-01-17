#!/usr/bin/env tsx

/**
 * カードデータをTSVからD1にインポートするスクリプト
 *
 * 使い方:
 *   tsx scripts/import-cards.ts <cards.tsv> <cards-detail.tsv>
 */

import fs from 'fs';

interface Card {
  cardId: string;
  name: string;
  normalizedName: string;
  cardType?: string;
  attribute?: string;
  level?: number;
  atk?: number;
  def?: number;
  description?: string;
}

// Rustの正規化関数と同じロジック（簡易版）
function normalizeForSearch(text: string): string {
  let result = '';

  for (const char of text) {
    // 空白をスキップ
    if (/\s/.test(char) || char === '\u3000') continue;

    // 記号をスキップ
    if (/[・★☆※‼！？。、,，．:：;；「」『』【】〔〕（）()\[\]｛｝{}〈〉《》〜～~\-－_＿/／\\＼|｜&＆@＠#＃$＄%％^＾*＊+＋=＝<＜>＞'"]/.test(char)) {
      continue;
    }

    result += char;
  }

  // 異体字統一
  result = result.replace(/竜/g, '龍').replace(/剣/g, '劍');

  // 全角→半角
  result = result.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
  );

  // ひらがな→カタカナ
  result = result.replace(/[\u3041-\u3096]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) + 0x60)
  );

  // 小文字化
  return result.toLowerCase();
}

function parseCardsFile(filepath: string): Map<string, Partial<Card>> {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split('\t');

  const cards = new Map<string, Partial<Card>>();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || null;
    });

    const cardId = row.cardId || row.card_id || row.id;
    if (!cardId) continue;

    cards.set(cardId, {
      cardId,
      name: row.name || '',
      cardType: row.cardType || row.card_type,
      attribute: row.attribute,
      level: row.level ? parseInt(row.level) : undefined,
      atk: row.atk ? parseInt(row.atk) : undefined,
      def: row.def ? parseInt(row.def) : undefined,
    });
  }

  return cards;
}

function parseDetailsFile(filepath: string): Map<string, string> {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split('\t');

  const details = new Map<string, string>();

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || null;
    });

    const cardId = row.cardId || row.card_id || row.id;
    if (!cardId) continue;

    details.set(cardId, row.text || row.description || '');
  }

  return details;
}

function generateSQL(cards: Card[]): string {
  const inserts = cards.map(card => {
    const values = [
      `'${card.cardId.replace(/'/g, "''")}'`,
      `'${card.name.replace(/'/g, "''")}'`,
      `'${card.normalizedName.replace(/'/g, "''")}'`,
      card.cardType ? `'${card.cardType.replace(/'/g, "''")}'` : 'NULL',
      card.attribute ? `'${card.attribute.replace(/'/g, "''")}'` : 'NULL',
      card.level !== undefined ? card.level : 'NULL',
      card.atk !== undefined ? card.atk : 'NULL',
      card.def !== undefined ? card.def : 'NULL',
      card.description ? `'${card.description.replace(/'/g, "''")}'` : 'NULL',
    ];

    return `INSERT INTO cards (card_id, name, normalized_name, card_type, attribute, level, atk, def, description) VALUES (${values.join(', ')});`;
  });

  return inserts.join('\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: tsx scripts/import-cards.ts <cards.tsv> <cards-detail.tsv>');
    process.exit(1);
  }

  const cardsFile = args[0];
  const detailsFile = args[1];

  console.log('Parsing cards file...');
  const cardsMap = parseCardsFile(cardsFile);

  console.log('Parsing details file...');
  const detailsMap = parseDetailsFile(detailsFile);

  console.log('Merging data...');
  const cards: Card[] = [];

  for (const [cardId, card] of cardsMap) {
    const description = detailsMap.get(cardId);
    const normalizedName = normalizeForSearch(card.name || '');

    cards.push({
      cardId,
      name: card.name || '',
      normalizedName,
      cardType: card.cardType,
      attribute: card.attribute,
      level: card.level,
      atk: card.atk,
      def: card.def,
      description,
    });
  }

  console.log(`Generating SQL for ${cards.length} cards...`);
  const sql = generateSQL(cards);

  const outputFile = 'import-cards.sql';
  fs.writeFileSync(outputFile, sql, 'utf-8');

  console.log(`SQL written to ${outputFile}`);
  console.log(`\nTo import to D1, run:`);
  console.log(`  wrangler d1 execute ygo-search --file=${outputFile}`);
}

main().catch(console.error);
