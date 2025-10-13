import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../env';

let pc: Pinecone | null = null;
function getPc() {
  if (!pc) {
    if (!env.PINECONE_API_KEY) throw new Error('PINECONE_API_KEY not set');
    pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });
  }
  return pc;
}

function getIndex() {
  return getPc().index(env.PINECONE_INDEX_NAME);
}

export type VectorUpsert = { id: string; values: number[]; metadata?: Record<string, any> };

export async function upsertVectors(namespace: string, items: VectorUpsert[]) {
  await getIndex().namespace(namespace).upsert(items);
}

export async function queryVectors(namespace: string, vector: number[], topK = 8, filter?: Record<string, any>) {
  const res = await getIndex().namespace(namespace).query({ topK, vector, filter, includeMetadata: true });
  return res.matches ?? [];
}
