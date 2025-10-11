import { upsertVectors } from '../util/pinecone';

export async function embedMessage(mailboxRef: string, messageId: string, text: string) {
  // TODO: call your embedding model (OpenAI, Gemini, etc.)
  const fake = Array.from({ length: 1536 }, () => Math.random()); // replace with real embeddings
  await upsertVectors(mailboxRef, [{ id: messageId, values: fake, metadata: { messageId } }]);
}

