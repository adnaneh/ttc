import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../env';
const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });
export const index = pc.index(env.PINECONE_INDEX_NAME);

export type VectorUpsert = { id: string; values: number[]; metadata?: Record<string, any> };

export async function upsertVectors(namespace: string, items: VectorUpsert[]) {
  await index.namespace(namespace).upsert(items);
}

export async function queryVectors(namespace: string, vector: number[], topK = 8, filter?: Record<string, any>) {
  const res = await index.namespace(namespace).query({ topK, vector, filter, includeMetadata: true });
  return res.matches ?? [];
}
