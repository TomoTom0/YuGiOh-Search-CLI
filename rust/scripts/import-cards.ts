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
  ruby?: string;
  ciid?: string;
  imgs?: string;
  cardType?: string;
  attribute?: string;
  levelType?: string;
  level?: number;
  atk?: number;
  def?: number;
  description?: string;
  race?: string;
  monsterTypes?: string;
  spellEffectType?: string;
  trapEffectType?: string;
  linkMarkers?: string;
  linkValue?: number;
  pendulumScale?: string;
  pendulumText?: string;
  isExtraDeck?: string;
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
      ruby: row.ruby,
      ciid: row.ciid,
      imgs: row.imgs,
      cardType: row.cardType || row.card_type,
      attribute: row.attribute,
      levelType: row.levelType,
      level: row.levelValue ? parseInt(row.levelValue) : undefined,
      atk: row.atk ? parseInt(row.atk) : undefined,
      def: row.def ? parseInt(row.def) : undefined,
      race: row.race,
      monsterTypes: row.monsterTypes,
      spellEffectType: row.spellEffectType || row.spell_effect_type,
      trapEffectType: row.trapEffectType || row.trap_effect_type,
      linkMarkers: row.linkMarkers || row.link_markers,
      linkValue: row.linkValue ? parseInt(row.linkValue) : undefined,
      pendulumScale: row.pendulumScale,
      pendulumText: row.pendulumText,
      isExtraDeck: row.isExtraDeck,
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

    details.set(cardId, row.supplementInfo || row.text || row.description || '');
  }

  return details;
}

function generateSQL(cards: Card[]): string {
  const batchSize = 1000;
  const batches: string[] = [];

  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    const inserts = batch.map(card => {
      const escapeString = (str: string) => str.replace(/'/g, "''").replace(/\n/g, '\\n').replace(/\r/g, '\\r');

      const values = [
        `'${escapeString(card.cardId)}'`,
        `'${escapeString(card.name)}'`,
        `'${escapeString(card.normalizedName)}'`,
        card.ruby ? `'${escapeString(card.ruby)}'` : 'NULL',
        card.ciid ? `'${escapeString(card.ciid)}'` : 'NULL',
        card.imgs ? `'${escapeString(card.imgs)}'` : 'NULL',
        card.cardType ? `'${escapeString(card.cardType)}'` : 'NULL',
        card.attribute ? `'${escapeString(card.attribute)}'` : 'NULL',
        card.levelType ? `'${escapeString(card.levelType)}'` : 'NULL',
        card.level !== undefined && card.level !== null && !isNaN(card.level) ? card.level : 'NULL',
        card.atk !== undefined && card.atk !== null && !isNaN(card.atk) ? card.atk : 'NULL',
        card.def !== undefined && card.def !== null && !isNaN(card.def) ? card.def : 'NULL',
        card.description ? `'${escapeString(card.description)}'` : 'NULL',
        card.race ? `'${escapeString(card.race)}'` : 'NULL',
        card.monsterTypes ? `'${escapeString(card.monsterTypes)}'` : 'NULL',
        card.spellEffectType ? `'${escapeString(card.spellEffectType)}'` : 'NULL',
        card.trapEffectType ? `'${escapeString(card.trapEffectType)}'` : 'NULL',
        card.linkMarkers ? `'${escapeString(card.linkMarkers)}'` : 'NULL',
        card.linkValue !== undefined && card.linkValue !== null && !isNaN(card.linkValue) ? card.linkValue : 'NULL',
        card.pendulumScale ? `'${escapeString(card.pendulumScale)}'` : 'NULL',
        card.pendulumText ? `'${escapeString(card.pendulumText)}'` : 'NULL',
        card.isExtraDeck ? `'${escapeString(card.isExtraDeck)}'` : 'NULL',
      ];

      return `INSERT INTO cards (card_id, name, normalized_name, ruby, ciid, imgs, card_type, attribute, level_type, level, atk, def, description, race, monster_types, spell_effect_type, trap_effect_type, link_markers, link_value, pendulum_scale, pendulum_text, is_extra_deck) VALUES (${values.join(', ')});`;
    });

    batches.push(`-- Batch ${Math.floor(i / batchSize) + 1} (cards ${i + 1}-${Math.min(i + batchSize, cards.length)})`);
    batches.push(inserts.join('\n'));
  }

  return batches.join('\n\n');
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

  for (const cardId of cardsMap.keys()) {
    const cardData = cardsMap.get(cardId)!;
    const details = detailsMap.get(cardId);
    const normalizedName = normalizeForSearch(cardData.name || '');

    cards.push({
      cardId,
      name: cardData.name || '',
      normalizedName,
      ruby: cardData.ruby || null,
      ciid: cardData.ciid || null,
      imgs: cardData.imgs || null,
      cardType: cardData.cardType,
      attribute: cardData.attribute,
      levelType: cardData.levelType || null,
      level: cardData.level,
      atk: cardData.atk,
      def: cardData.def,
      description: details,
      race: cardData.race || null,
      monsterTypes: cardData.monsterTypes || null,
      spellEffectType: cardData.spellEffectType || null,
      trapEffectType: cardData.trapEffectType || null,
      linkMarkers: cardData.linkMarkers || null,
      linkValue: cardData.linkValue || null,
      pendulumScale: cardData.pendulumScale || null,
      pendulumText: cardData.pendulumText || null,
      isExtraDeck: cardData.isExtraDeck || null,
    });
  }

  console.log(`Generating SQL for ${cards.length} cards...`);
  const sql = generateSQL(cards);

  const outputFile = './tmp/import-cards.sql';
  fs.writeFileSync(outputFile, sql, 'utf-8');

  console.log(`SQL written to ${outputFile}`);
  console.log(`\nTo import to D1, run:`);
  console.log(`  wrangler d1 execute ygo-search --file=${outputFile}`);
}

main().catch(console.error);
