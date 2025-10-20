import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
import { db } from '../util/firestore';
import { readByPtr } from '../util/storage';
import { getFreshAccessTokenForMailbox, getFreshGraphAccessTokenForMailbox } from '../util/tokenStore';
import { setTriageLabelExclusive, addPersistentLabel } from '../util/labels';

function strip(html: string) { return html.replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' '); }

export const triageProcess = onMessagePublished('triage.process', async (event) => {
  const payload = event.data?.message?.data ? JSON.parse(Buffer.from(event.data.message.data, 'base64').toString()) : {};
  const { provider, mailboxId, threadId, messageId, from, subject, bodyPtr } = payload;
  if (!provider || !mailboxId || !threadId || !messageId || !from || !bodyPtr) return;

  try {
    const html = (await readByPtr(bodyPtr)).toString('utf8');
    const text = strip(html);
    const noreply = /no[-\s]?reply|donotreply|do[-\s]?not[-\s]?reply/i.test(from);
    const shortInfo = text.length < 180 && !/[?]/.test(text);

    const token = provider === 'gmail'
      ? await getFreshAccessTokenForMailbox(db.collection('mailboxes').doc(mailboxId).path)
      : await getFreshGraphAccessTokenForMailbox(db.collection('mailboxes').doc(mailboxId).path);

    // If this thread has a quote or an incoherence case -> persistent label AND set triage = TO_RESPOND
    const hasQuote = !(await db.collection('quotes').where('threadId','==',threadId).limit(1).get()).empty;
    const hasIncoh = !(await db.collection('cases').where('threadId','==',threadId).limit(1).get()).empty;

    if (hasQuote) {
      await addPersistentLabel({ provider, token, mailboxId, threadId, messageId, key: 'SPOT_RATE' });
      await setTriageLabelExclusive({ provider, token, mailboxId, threadId, messageId, key: 'TO_RESPOND' });
      return;
    }
    if (hasIncoh) {
      await addPersistentLabel({ provider, token, mailboxId, threadId, messageId, key: 'INCOHERENCE' });
      await setTriageLabelExclusive({ provider, token, mailboxId, threadId, messageId, key: 'TO_RESPOND' });
      return;
    }

    // Otherwise decide FYI vs TO_RESPOND
    if (noreply || shortInfo) {
      await setTriageLabelExclusive({ provider, token, mailboxId, threadId, messageId, key: 'FYI' });
      return;
    }

    await setTriageLabelExclusive({ provider, token, mailboxId, threadId, messageId, key: 'TO_RESPOND' });
  } catch (e: any) {
    await db.collection('events').add({ type: 'triage.error', error: String(e?.message || e), mailboxId, threadId, messageId, ts: Date.now() });
    logger.error('triage.process failed', { err: String(e?.message || e) });
  }
});
