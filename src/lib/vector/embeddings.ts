import { pipeline, type FeatureExtractionPipeline } from '@xenova/transformers';

let embeddingPipeline: FeatureExtractionPipeline | null = null;

export async function initEmbeddings(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    console.error('Embedding modelを初期化中 (multilingual-e5-small)...');
    embeddingPipeline = await pipeline(
      'feature-extraction',
      'Xenova/multilingual-e5-small'
    );
    console.error('Embedding modelの読み込み完了');
  }
  return embeddingPipeline;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const model = await initEmbeddings();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const model = await initEmbeddings();
  const embeddings: number[][] = [];

  const BATCH_SIZE = 32;
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, Math.min(i + BATCH_SIZE, texts.length));
    console.error(`Embeddingを生成中: ${i}/${texts.length}`);

    const batchPromises = batch.map(text =>
      model(text, { pooling: 'mean', normalize: true })
    );
    const batchResults = await Promise.all(batchPromises);
    embeddings.push(...batchResults.map(output => Array.from(output.data)));
  }

  return embeddings;
}
