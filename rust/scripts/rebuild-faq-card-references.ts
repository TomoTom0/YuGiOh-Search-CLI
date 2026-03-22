#!/usr/bin/env tsx

/**
 * FAQからカード参照を抽出してfaq_card_referencesを再構築するスクリプト
 *
 * 使い方:
 *   tsx scripts/rebuild-faq-card-references.ts
 */

import fs from 'fs';

interface FAQCardReference {
  faqId: number;
  cardId: string;
  cardName: string;
}

// カード参照を抽出する関数
function extractCardReferences(faqId: number, text: string): FAQCardReference[] {
  const pattern = /\{\{([^|]+)\|([^}]+)\}\}/g;
  const matches = [...text.matchAll(pattern)];

  const references: FAQCardReference[] = [];
  const seen = new Set<string>();  // 重複を回避するため

  for (const match of matches) {
    const cardName = match[1].trim();
    const cardId = match[2].trim();
    const key = `${faqId}-${cardId}`;

    if (!seen.has(key)) {
      references.push({
        faqId,
        cardId,
        cardName,
      });
      seen.add(key);
    }
  }

  return references;
}

function parseFaqsFile(filepath: string): FAQCardReference[] {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split('\t');

  const allReferences: FAQCardReference[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    const faqId = row.faqId || row.faq_id || row.id;
    const question = row.question || row.Q || '';
    const answer = row.answer || row.A || '';

    if (!faqId) continue;

    const combinedText = `${question} ${answer}`;
    const references = extractCardReferences(parseInt(faqId), combinedText);

    allReferences.push(...references);
  }

  return allReferences;
}

function generateSQL(references: FAQCardReference[]): string {
  const refInserts = references.map(ref => {
    const values = [
      ref.faqId,
      `'${ref.cardId.replace(/'/g, "''")}'`,
      `'${ref.cardName.replace(/'/g, "''")}'`,
    ];
    return `INSERT INTO faq_card_references (faq_id, card_id, card_name) VALUES (${values.join(', ')});`;
  });

  return refInserts.join('\n');
}

async function main() {
  const faqsFile = '/home/tomo/work/app/ygo/ygo-search/data/faq-all.tsv';

  console.log('Parsing FAQs file...');
  const references = parseFaqsFile(faqsFile);

  console.log(`Found ${references.length} card references`);
  const sql = generateSQL(references);

  const outputFile = '/home/tomo/work/app/ygo/ygo-search/rust/rebuild-faq-card-references.sql';
  fs.writeFileSync(outputFile, sql, 'utf-8');

  console.log(`SQL written to ${outputFile}`);
  console.log(`\nTo import to D1, run:`);
  console.log(`  wrangler d1 execute ygo-search-db --file=${outputFile} --remote`);
}

main().catch(console.error);
