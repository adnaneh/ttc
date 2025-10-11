import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../util/firestore';
import { getFreshGraphAccessTokenForMailbox } from '../util/tokenStore';
import { createSubscription, renewSubscription } from '../connectors/outlook';
import { env } from '../env';
import { logger } from '../util/logger';

export const outlookRenew = onSchedule('every 30 minutes', async () => {
  const soon = Date.now() + 30 * 60 * 1000; // 30 min window
  const q = await db.collection('mailboxes')
    .where('type', '==', 'outlook')
    .where('sync.watchExpiration', '<=', soon)
    .limit(50).get();

  if (q.empty) return;

  for (const doc of q.docs) {
    const mailbox = doc.data() as any;
    try {
      const token = await getFreshGraphAccessTokenForMailbox(doc.ref.path);
      const newExp = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      if (mailbox.sync?.subscriptionId) {
        try {
          const r = await renewSubscription(token, mailbox.sync.subscriptionId, newExp);
          await doc.ref.update({ 'sync.watchExpiration': Date.parse(r.expirationDateTime) });
          logger.info('Renewed Graph sub', { mailboxId: doc.id, subId: mailbox.sync.subscriptionId });
          continue;
        } catch (e) {
          // If renew fails (e.g., 404), fall through to create new
          logger.warn('Renew failed; creating new sub', { mailboxId: doc.id, subId: mailbox.sync.subscriptionId });
        }
      }
      const sub = await createSubscription(token, env.GRAPH_WEBHOOK_URL, newExp);
      await doc.ref.update({
        'sync.subscriptionId': sub.id,
        'sync.watchExpiration': Date.parse(sub.expirationDateTime)
      });
      logger.info('Created new Graph sub', { mailboxId: doc.id, subId: sub.id });
    } catch (e: any) {
      logger.error('Outlook renew error', { mailboxId: doc.id, err: String(e?.message || e) });
    }
  }
});

