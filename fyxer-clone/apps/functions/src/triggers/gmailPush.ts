import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
import { getMailboxByEmail, getFreshAccessTokenForMailbox } from '../util/tokenStore';
import { ingestFromGmail } from '../pipelines/ingestGmail';
import { db } from '../util/firestore';
import { google } from 'googleapis';
import { parseCorrectionsFromText, applyCorrectionsFromCase } from '../util/corrections';

export const gmailPush = onMessagePublished('gmail-watch', async (event) => {
  const raw = event.data?.message?.data ? JSON.parse(Buffer.from(event.data.message.data, 'base64').toString()) : {};
  const emailAddress: string | undefined = raw.emailAddress;
  const historyId: string | undefined = raw.historyId ? String(raw.historyId) : undefined;

  logger.info('Gmail push', { emailAddress, historyId });
  if (!emailAddress || !historyId) return;

  const mailbox = await getMailboxByEmail(emailAddress);
  if (!mailbox) { logger.warn('No mailbox for email', { emailAddress }); return; }

  const token = await getFreshAccessTokenForMailbox(mailbox.ref.path);
  const startCursor = mailbox.data?.sync?.cursor || historyId;

  // 1) Normal ingest (also queues invoice processing)
  await ingestFromGmail(token, String(startCursor), mailbox.id);
  await mailbox.ref.update({ 'sync.cursor': historyId });

  // 2) Check the latest SENT messages in the thread for corrections
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  const gmail = google.gmail({ version: 'v1', auth });

  const list = await gmail.users.messages.list({ userId: 'me', labelIds: ['SENT'], maxResults: 30 });
  const ids = (list.data.messages || []).map(m => m.id!);
  for (const id of ids) {
    const full = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const headers = (full.data.payload?.headers || []) as Array<{name: string; value: string}>;
    const xcase = headers.find(h => h.name?.toLowerCase() === 'x-fyxer-case-id')?.value;
    if (!xcase) continue;

    // Prefer plaintext part for reliable parsing
    let text = '';
    const walk = (p?: any) => {
      if (!p) return;
      if (p.mimeType === 'text/plain' && p.body?.data) {
        text += Buffer.from(p.body.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8') + '\n';
      }
      (p.parts || []).forEach(walk);
    };
    walk(full.data.payload);
    if (!text) {
      // fallback to html
      const htmlPart = (() => {
        let got = '';
        const rec = (p?: any) => { if (!p) return; if (p.mimeType === 'text/html' && p.body?.data) got = Buffer.from(p.body.data.replace(/-/g,'+').replace(/_/g,'/'),'base64').toString('utf8'); (p.parts||[]).forEach(rec); };
        rec(full.data.payload);
        return got;
      })();
      text = htmlPart.replace(/<[^>]+>/g, ' ');
    }

    const { caseId, corrections } = parseCorrectionsFromText(text);
    if (!caseId || caseId !== xcase) continue;
    if (!Object.keys(corrections).length) continue;

    try {
      await applyCorrectionsFromCase(caseId, corrections);
      logger.info('Applied SAP corrections', { caseId, corrections });
    } catch (e: any) {
      await db.collection('cases').doc(caseId).update({ status: 'error', error: String(e?.message || e), updatedAt: Date.now() }).catch(() => {});
      logger.error('Failed applying corrections', { caseId, err: String(e?.message || e) });
    }
  }
});
