import { onRequest } from 'firebase-functions/v2/https';
import { logger } from '../util/logger';
import { db } from '../util/firestore';
import { getFreshGraphAccessTokenForMailbox } from '../util/tokenStore';
import { ingestOutlookChanges } from '../pipelines/ingestOutlook';

type GraphNotif = { value: Array<{ subscriptionId: string }> };

export const graphWebhook = onRequest(async (req, res) => {
  // Validation handshake (Graph sends ?validationToken=)
  const token = req.query.validationToken as string | undefined;
  if (token) {
    logger.info('Graph validation handshake');
    return res.status(200).send(token);
  }

  const body = req.body as GraphNotif;
  if (!body?.value?.length) return res.status(202).end();

  // De-duplicate subscriptionIds
  const subs = Array.from(new Set(body.value.map(v => v.subscriptionId)));

  for (const subId of subs) {
    const q = await db.collection('mailboxes').where('sync.subscriptionId', '==', subId).limit(5).get();
    if (q.empty) { logger.warn('No mailbox for subscription', { subId }); continue; }

    for (const doc of q.docs) {
      try {
        const token = await getFreshGraphAccessTokenForMailbox(doc.ref.path);
        const resu = await ingestOutlookChanges(token, doc.id);
        logger.info('Outlook changes processed', { mailboxId: doc.id, ...resu });
      } catch (e: any) {
        logger.error('Outlook ingest error', { mailboxId: doc.id, err: String(e?.message || e) });
      }
    }
  }

  res.status(202).end();
});
