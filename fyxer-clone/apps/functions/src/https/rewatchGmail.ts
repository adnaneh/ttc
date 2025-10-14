import { onRequest } from 'firebase-functions/v2/https';
import { logger } from '../util/logger';
import { db } from '../util/firestore';
import { getFreshAccessTokenForMailbox } from '../util/tokenStore';
import { startWatch } from '../connectors/gmail';

// Dev-only endpoint to immediately re-issue Gmail watch for all Gmail mailboxes
export const rewatchGmail = onRequest(async (_req, res) => {
  try {
    const q = await db.collection('mailboxes').where('type', '==', 'gmail').limit(200).get();
    if (q.empty) {
      res.status(200).send('No Gmail mailboxes found');
      return;
    }
    let ok = 0, fail = 0;
    for (const doc of q.docs) {
      try {
        const token = await getFreshAccessTokenForMailbox(doc.ref.path);
        const watch = await startWatch(token);
        await doc.ref.update({
          'sync.cursor': String(watch.historyId ?? ''),
          'sync.watchExpiration': Number(watch.expiration ?? 0),
          'sync.renewedAt': Date.now()
        });
        ok++;
      } catch (e: any) {
        logger.error('rewatchGmail failed', { mailboxId: doc.id, err: String(e?.message || e) });
        fail++;
      }
    }
    res.status(200).send(`Rewatch complete. ok=${ok} fail=${fail}`);
  } catch (e: any) {
    res.status(500).send(String(e?.message || e));
  }
});

