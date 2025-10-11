import { Pinecone } from '@pinecone-database/pinecone';
import { env } from '../env';
const pc = new Pinecone({ apiKey: env.PINECONE_API_KEY });
export const index = pc.index('fyxer-prod'); // create in Pinecone; one per env

export type VectorUpsert = { id: string; values: number[]; metadata?: Record<string, any> };

export async function upsertVectors(namespace: string, items: VectorUpsert[]) {
  await index.namespace(namespace).upsert(items);
}

