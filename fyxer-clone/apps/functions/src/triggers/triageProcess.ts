import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
import { db } from '../util/firestore';
import { readByPtr } from '../util/storage';
import { getFreshAccessTokenForMailbox, getFreshGraphAccessTokenForMailbox } from '../util/tokenStore';
import { createGmailDraftSimpleReply } from '../util/gmailDraft';
import { createOutlookDraftReply } from '../util/outlookDraft';
import { applyLabel } from '../util/labels';
import { makeDefaultReplyHTML } from '../util/defaultReply';

function strip(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ');
}

function fallbackNameFromEmail(email: string) {
  const local = (email || '').split('@')[0] || 'Customer';
  return local.split('.').map(s => (s ? s[0].toUpperCase() + s.slice(1) : s)).join(' ');
}

export const triageProcess = onMessagePublished(
  { topic: 'triage.process', memory: '512MiB', timeoutSeconds: 300 },
  async (event) => {
    const payload = event.data?.message?.data
      ? JSON.parse(Buffer.from(event.data.message.data, 'base64').toString())
      : {};
    const { provider, mailboxId, threadId, messageId, from, subject, bodyPtr } = payload as any;
    if (!provider || !mailboxId || !threadId || !messageId || !from || !bodyPtr) return;

    try {
      // 1) Skip if special flows already present (spot rate or incoherence)
      const hasQuote = !(await db.collection('quotes')
        .where('threadId', '==', threadId).where('status', 'in', ['drafted', 'sent']).limit(1).get()).empty;
      const hasIncoh = !(await db.collection('cases')
        .where('threadId', '==', threadId).where('status', '==', 'drafted').limit(1).get()).empty;

      const token = provider === 'gmail'
        ? await getFreshAccessTokenForMailbox(db.collection('mailboxes').doc(mailboxId).path)
        : await getFreshGraphAccessTokenForMailbox(db.collection('mailboxes').doc(mailboxId).path);

      if (hasQuote) {
        await applyLabel({ provider, token, mailboxId, threadId, messageId, label: 'SPOT_RATE' });
        return;
      }
      if (hasIncoh) {
        await applyLabel({ provider, token, mailboxId, threadId, messageId, label: 'INCOHERENCE' });
        return;
      }

      // 2) Heuristic: FYI vs to respond
      const html = (await readByPtr(bodyPtr)).toString('utf8');
      const text = strip(html);
      const noreply = /no[-\s]?reply|donotreply|do[-\s]?not[-\s]?reply/i.test(from);
      const hasQuestion = /[?]/.test(text);
      const shortInfo = text.length < 180 && !hasQuestion;

      const customerName = fallbackNameFromEmail(from);

      if (noreply || shortInfo) {
        await applyLabel({ provider, token, mailboxId, threadId, messageId, label: 'FYI' });
        return;
      }

      // 3) Default reply draft for "to respond"
      const replyHtml = await makeDefaultReplyHTML({ customerName, subject, plainText: text });

      if (provider === 'gmail') {
        await createGmailDraftSimpleReply({
          accessToken: token,
          threadId,
          to: from,
          subject: `Re: ${subject || ''}`.trim(),
          htmlBody: replyHtml,
          extraHeaders: { 'X-Fyxer-Default-Reply': '1' }
        });
      } else {
        await createOutlookDraftReply({
          accessToken: token,
          replyToMessageId: messageId,
          to: from,
          subject: `Re: ${subject || ''}`.trim(),
          htmlBody: replyHtml // contains hidden marker
        });
      }

      await applyLabel({ provider, token, mailboxId, threadId, messageId, label: 'TO_RESPOND' });
    } catch (e: any) {
      logger.error('triage.process failed', { err: String(e?.message || e) });
      await db.collection('events').add({
        type: 'triage.error',
        error: String(e?.message || e),
        mailboxId, threadId, messageId, ts: Date.now()
      });
    }
  }
);

