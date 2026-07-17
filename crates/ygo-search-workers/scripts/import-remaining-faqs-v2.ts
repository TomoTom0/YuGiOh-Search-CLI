#!/usr/bin/env tsx

/**
 * 残りのFAQデータをTSVからD1にインポートするスクリプト（INSERT OR IGNORE版）
 *
 * 使い方:
 *   tsx scripts/import-remaining-faqs-v2.ts <remaining-faq-ids.txt> <faq-all.tsv>
 */

import fs from 'fs';

interface FAQ {
  faqId: number;
  cardId: string;
  question: string;
  answer: string;
  normalizedQuestion: string;
  normalizedAnswer: string;
  cardReferences: Array<{ name: string; cardId: string }>;
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

function extractCardReferences(text: string): Array<{ name: string; cardId: string }> {
  const pattern = /\{\{([^|]+)\|([^}]+)\}\}/g;
  const matches = [...text.matchAll(pattern)];

  return matches.map(match => ({
    name: match[1].trim(),
    cardId: match[2].trim(),
  }));
}

function parseFaqsFile(filepath: string, faqIdsToInclude: Set<string>): FAQ[] {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split('\t');

  const faqs: FAQ[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split('\t');
    const row: any = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });

    const faqId = row.faqId || row.faq_id || row.id;
    const question = row.question || row.Q || '';
    const answer = row.answer || row.A || '';

    if (!faqId || !faqIdsToInclude.has(faqId.toString())) continue;

    const combinedText = `${question} ${answer}`;
    const cardReferences = extractCardReferences(combinedText);
    const cardId = cardReferences.length > 0 ? cardReferences[0].cardId : '';

    if (!cardId) continue;

    faqs.push({
      faqId: parseInt(faqId),
      cardId,
      question,
      answer,
      normalizedQuestion: normalizeForSearch(question),
      normalizedAnswer: normalizeForSearch(answer),
      cardReferences,
    });
  }

  return faqs;
}

function generateSQL(faqs: FAQ[]): string {
  const faqInserts = faqs.map(faq => {
    const values = [
      faq.faqId,
      `'${faq.cardId.replace(/'/g, "''")}'`,
      `'${faq.question.replace(/'/g, "''")}'`,
      `'${faq.answer.replace(/'/g, "''")}'`,
      `'${faq.normalizedQuestion.replace(/'/g, "''")}'`,
      `'${faq.normalizedAnswer.replace(/'/g, "''")}'`,
    ];

    return `INSERT OR IGNORE INTO faqs (faq_id, card_id, question, answer, normalized_question, normalized_answer) VALUES (${values.join(', ')});`;
  });

  const refInserts: string[] = [];
  for (const faq of faqs) {
    for (const ref of faq.cardReferences) {
      const values = [
        faq.faqId,
        `'${ref.cardId.replace(/'/g, "''")}'`,
        `'${ref.name.replace(/'/g, "''")}'`,
      ];
      refInserts.push(`INSERT OR IGNORE INTO faq_card_references (faq_id, card_id, card_name) VALUES (${values.join(', ')});`);
    }
  }

  return [...faqInserts, ...refInserts].join('\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: tsx scripts/import-remaining-faqs-v2.ts <remaining-faq-ids.txt> <faq-all.tsv>');
    process.exit(1);
  }

  const faqIdsFile = args[0];
  const faqsFile = args[1];

  // Read FAQ IDs to include
  const faqIdsContent = fs.readFileSync(faqIdsFile, 'utf-8');
  const faqIdsToInclude = new Set(faqIdsContent.trim().split('\n').filter(id => id.trim()));

  console.log('Parsing FAQs file...');
  const faqs = parseFaqsFile(faqsFile, faqIdsToInclude);

  console.log(`Generating SQL for ${faqs.length} FAQs...`);
  const sql = generateSQL(faqs);

  const outputFile = 'import-remaining-faqs-v2.sql';
  fs.writeFileSync(outputFile, sql, 'utf-8');

  console.log(`SQL written to ${outputFile}`);
  console.log(`\nTo import to D1, run:`);
  console.log(`  wrangler d1 execute ygo-search-db --file=${outputFile} --remote`);
}

main().catch(console.error);
