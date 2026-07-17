#!/usr/bin/env tsx

/**
 * FAQデータをTSVからD1にインポートするスクリプト
 *
 * 使い方:
 *   tsx scripts/import-faqs.ts <faq-all.tsv>
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

function parseFaqsFile(filepath: string): FAQ[] {
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
    const cardId = row.cardId || row.card_id;
    const question = row.question || row.Q || '';
    const answer = row.answer || row.A || '';

    if (!faqId || !cardId) continue;

    const combinedText = `${question} ${answer}`;
    const cardReferences = extractCardReferences(combinedText);

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

    return `INSERT INTO faqs (faq_id, card_id, question, answer, normalized_question, normalized_answer) VALUES (${values.join(', ')});`;
  });

  const refInserts: string[] = [];
  for (const faq of faqs) {
    for (const ref of faq.cardReferences) {
      const values = [
        faq.faqId,
        `'${ref.cardId.replace(/'/g, "''")}'`,
        `'${ref.name.replace(/'/g, "''")}'`,
      ];
      refInserts.push(`INSERT INTO faq_card_references (faq_id, card_id, card_name) VALUES (${values.join(', ')});`);
    }
  }

  return [...faqInserts, ...refInserts].join('\n');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('Usage: tsx scripts/import-faqs.ts <faq-all.tsv>');
    process.exit(1);
  }

  const faqsFile = args[0];

  console.log('Parsing FAQs file...');
  const faqs = parseFaqsFile(faqsFile);

  console.log(`Generating SQL for ${faqs.length} FAQs...`);
  const sql = generateSQL(faqs);

  const outputFile = 'import-faqs.sql';
  fs.writeFileSync(outputFile, sql, 'utf-8');

  console.log(`SQL written to ${outputFile}`);
  console.log(`\nTo import to D1, run:`);
  console.log(`  wrangler d1 execute ygo-search --file=${outputFile}`);
}

main().catch(console.error);
