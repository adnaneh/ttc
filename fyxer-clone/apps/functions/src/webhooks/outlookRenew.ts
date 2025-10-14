import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../util/firestore';
import { getFreshGraphAccessTokenForMailbox } from '../util/tokenStore';
import { createSubscription, renewSubscription } from '../connectors/outlook';
import { } from 'node:process';
import { logger } from '../util/logger';

async function renewForFolder(mailboxDoc: any, folder: 'Inbox'|'SentItems') {
  const mailbox = mailboxDoc.data() as any;
  const sync = mailbox.sync?.[folder === 'Inbox' ? 'inbox' : 'sent'] || {};
  const token = await getFreshGraphAccessTokenForMailbox(mailboxDoc.ref.path);
  const newExp = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  if (sync.subscriptionId) {
    try {
      const r = await renewSubscription(token, sync.subscriptionId, newExp);
      await mailboxDoc.ref.update({ [`sync.${folder === 'Inbox' ? 'inbox' : 'sent'}.watchExpiration`]: Date.parse(r.expirationDateTime) });
      logger.info('Renewed Graph sub', { mailboxId: mailboxDoc.id, folder });
      return;
    } catch (e) {
      logger.warn('Renew failed; creating new sub', { mailboxId: mailboxDoc.id, folder, err: String((e as any)?.message || e) });
    }
  }
  const sub = await createSubscription(token, process.env.GRAPH_WEBHOOK_URL!, newExp, folder);
  await mailboxDoc.ref.update({
    [`sync.${folder === 'Inbox' ? 'inbox' : 'sent'}.subscriptionId`]: sub.id,
    [`sync.${folder === 'Inbox' ? 'inbox' : 'sent'}.watchExpiration`]: Date.parse(sub.expirationDateTime)
  });
  logger.info('Created Graph sub', { mailboxId: mailboxDoc.id, folder, subId: sub.id });
}

export const outlookRenew = onSchedule('every 30 minutes', async () => {
  const soon = Date.now() + 30 * 60 * 1000;

  // Inbox renewals
  let q = await db.collection('mailboxes')
    .where('type', '==', 'outlook')
    .where('sync.inbox.watchExpiration', '<=', soon).limit(50).get();

  for (const doc of q.docs) await renewForFolder(doc, 'Inbox');

  // SentItems renewals
  q = await db.collection('mailboxes')
    .where('type', '==', 'outlook')
    .where('sync.sent.watchExpiration', '<=', soon).limit(50).get();

  for (const doc of q.docs) await renewForFolder(doc, 'SentItems');
});
