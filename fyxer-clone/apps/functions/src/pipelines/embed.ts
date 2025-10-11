import OpenAI from 'openai';
import { env } from '../env';
import { db } from '../util/firestore';
import { readByPtr } from '../util/storage';
import { upsertVectors } from '../util/pinecone';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

function stripHtml(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ');
}

async function embedText(text: string): Promise<number[]> {
  if (!openai) throw new Error('OPENAI_API_KEY not set');
  const res = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 7500)
  });
  return res.data[0].embedding as number[];
}

export async function embedMessage(mailboxId: string, messageId: string) {
  const snap = await db.collection('messages').doc(messageId).get();
  if (!snap.exists) return;
  const msg = snap.data() as any;
  const buf = await readByPtr(msg.bodyPtr);
  const text = stripHtml(buf.toString('utf8')).replace(/\s+/g, ' ').trim();

  const vector = await embedText(text || msg.snippet || '');
  await upsertVectors(mailboxId, [{ id: messageId, values: vector, metadata: {
    messageId,
    threadRef: msg.threadRef,
    sentAt: msg.sentAt,
    from: msg.from
  }}]);
}
