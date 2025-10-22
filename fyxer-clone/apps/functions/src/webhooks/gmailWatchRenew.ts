import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from '../util/logger';
import { db } from '../util/firestore';
import { getFreshAccessTokenForMailbox } from '../util/tokenStore';
import { startWatch } from '../connectors/gmail';

export const gmailWatchRenew = onSchedule('every 60 minutes', async () => {
  const gmailDisabled = String(process.env.GMAIL_DISABLE || '').toLowerCase();
  const skipGmail = gmailDisabled === '1' || gmailDisabled === 'true' || gmailDisabled === 'yes';
  if (skipGmail) return;

  const soon = Date.now() + 60 * 60 * 1000; // 1h lookahead
  const q = await db.collection('mailboxes')
    .where('type', '==', 'gmail')
    .where('sync.watchExpiration', '<=', soon)
    .limit(50)
    .get();

  if (q.empty) { logger.info('No Gmail watches to renew'); return; }

  for (const doc of q.docs) {
    try {
      const mailbox = doc.data() as any;
      const token = await getFreshAccessTokenForMailbox(doc.ref.path);
      const watch = await startWatch(token);
      await doc.ref.update({
        'sync.cursor': String(watch.historyId ?? mailbox.sync?.cursor ?? ''),
        'sync.watchExpiration': Number(watch.expiration ?? 0),
        'sync.renewedAt': Date.now()
      });
      logger.info('Renewed Gmail watch', { mailboxId: doc.id, expiration: watch.expiration });
    } catch (e: any) {
      logger.error('Failed to renew watch', { mailboxId: doc.id, err: String(e?.message || e) });
    }
  }
});
