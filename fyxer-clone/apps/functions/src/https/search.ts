import { onRequest } from 'firebase-functions/v2/https';
import OpenAI from 'openai';
import { env } from '../env';
import { db } from '../util/firestore';
import { queryVectors } from '../util/pinecone';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

async function embedQuery(q: string): Promise<number[]> {
  if (!openai) throw new Error('OPENAI_API_KEY not set');
  const res = await openai.embeddings.create({ model: 'text-embedding-3-small', input: q.slice(0, 7500) });
  return res.data[0].embedding as number[];
}

export const search = onRequest(async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('POST only');
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body || '{}'); } catch { return {}; } })() : (req.body || {});
  const { q, mailboxId, topK = 8, filter } = body as { q?: string; mailboxId?: string; topK?: number; filter?: Record<string, any> };

  if (!q || !mailboxId) return res.status(400).json({ error: 'q and mailboxId are required' });

  const vector = await embedQuery(q);
  const matches = await queryVectors(mailboxId, vector, topK, filter);

  // Hydrate minimal message info
  const ids = matches.map(m => m.id as string);
  const docs = await Promise.all(ids.map(id => db.collection('messages').doc(id).get()));
  const results = docs.map((d, i) => ({
    id: d.id,
    score: (matches[i] as any)?.score ?? null,
    ...d.data()
  }));

  res.json({ results });
});

