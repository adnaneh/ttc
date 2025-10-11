import { onRequest } from 'firebase-functions/v2/https';
import { logger } from '../util/logger';
import { db } from '../util/firestore';
import { getFreshGraphAccessTokenForMailbox } from '../util/tokenStore';
import { ingestOutlookFolderChanges } from '../pipelines/ingestOutlook';

type GraphNotif = { value: Array<{ subscriptionId: string }> };

export const graphWebhook = onRequest(async (req, res) => {
  const token = req.query.validationToken as string | undefined;
  if (token) return res.status(200).send(token); // handshake

  const body = req.body as GraphNotif;
  if (!body?.value?.length) return res.status(202).end();

  const subs = Array.from(new Set(body.value.map(v => v.subscriptionId)));

  for (const subId of subs) {
    // Try to match Inbox sub
    let q = await db.collection('mailboxes').where('sync.inbox.subscriptionId', '==', subId).limit(5).get();
    let folder: 'Inbox'|'SentItems'|null = null;
    if (!q.empty) folder = 'Inbox';
    else {
      q = await db.collection('mailboxes').where('sync.sent.subscriptionId', '==', subId).limit(5).get();
      if (!q.empty) folder = 'SentItems';
    }
    if (!folder) { logger.warn('No mailbox for subscription', { subId }); continue; }

    for (const doc of q.docs) {
      try {
        const token = await getFreshGraphAccessTokenForMailbox(doc.ref.path);
        const resu = await ingestOutlookFolderChanges(token, doc.id, folder);
        logger.info('Outlook changes processed', { mailboxId: doc.id, folder, ...resu });
      } catch (e: any) {
        logger.error('Outlook ingest error', { mailboxId: doc.id, folder, err: String(e?.message || e) });
      }
    }
  }

  res.status(202).end();
});
