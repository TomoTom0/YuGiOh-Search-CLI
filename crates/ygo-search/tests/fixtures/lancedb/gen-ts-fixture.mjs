// LanceDB 相互運用テスト用 fixture の生成器（TS 側）。
//
// TS(@lancedb/lancedb 0.31) がレコードからスキーマを「推論」させた LanceDB DB を生成する。
// JS の数値は Float64 に推論されるため、整数値メタデータ(level/faqId)は Float64 列になる。
// これが Rust 側の Int64 リテラルフィルタ(exclude.faqIds)と整合するかを検証するのが
// この fixture を使うテスト(tests/vector_interop.rs)の目的（m3-t3-indexer-decisions.md §相互運用検証）。
//
// モデル不要（ハードコード dim=3 ベクトル）。実行:
//   リポジトリルートで実行: node crates/ygo-search/tests/fixtures/lancedb/gen-ts-fixture.mjs
//
// ※ @lancedb/lancedb の版を上げた際は再生成すること（README.md 参照）。
import { connect } from '@lancedb/lancedb';
import { rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workdir = resolve(here, 'ts-workdir');
const dbPath = resolve(workdir, 'data', 'vector');
rmSync(dbPath, { recursive: true, force: true });

const cards = [
  { id: 'c1', text: 'Dragon A', vector: [1.0, 0.0, 0.0], metadata: { category: 'dragon', level: 8 } },
  { id: 'c2', text: 'Dragon B', vector: [0.9, 0.1, 0.0], metadata: { category: 'dragon', level: 4 } },
  { id: 'c3', text: 'Spell A',  vector: [0.0, 1.0, 0.0], metadata: { category: 'spell',  level: 0 } },
  { id: 'c4', text: 'Trap A',   vector: [0.0, 0.0, 1.0], metadata: { category: 'trap',   level: 0 } },
];

const faqs = [
  { id: 'f1', text: 'Dragon question', vector: [0.9, 0.1, 0.0], metadata: { category: 'dragon', faqId: 201 } },
  { id: 'f2', text: 'Spell question',  vector: [0.0, 1.0, 0.0], metadata: { category: 'spell',  faqId: 202 } },
  { id: 'f3', text: 'Trap question',   vector: [0.0, 0.0, 1.0], metadata: { category: 'trap',   faqId: 203 } },
];

const db = await connect(dbPath);
await db.createTable('cards', cards);
await db.createTable('faqs', faqs);

for (const name of ['cards', 'faqs']) {
  const t = await db.openTable(name);
  const schema = await t.schema();
  console.log(`[${name}] rows=${await t.countRows()}`);
  for (const f of schema.fields) {
    console.log(`  ${f.name}: ${f.type} (nullable=${f.nullable})`);
  }
}
console.log(`\nTS 作成 fixture: ${dbPath}`);
