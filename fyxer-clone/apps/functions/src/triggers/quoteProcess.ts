import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
import { db } from '../util/firestore';
import { readByPtr } from '../util/storage';
import { detectIntent, parseShipment } from '../util/quoteParse';
import { compileQuotes } from '../util/quoteSources';
import { renderQuoteHtml } from '../util/quoteEmail';
import { getFreshGraphAccessTokenForMailbox, getFreshAccessTokenForMailbox } from '../util/tokenStore';
import { createOutlookDraftReply } from '../util/outlookDraft';
import { createGmailDraftSimpleReply } from '../util/gmailDraft';

function strip(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ');
}

function getKeywords(): string[] {
  const raw = process.env.QUOTE_KEYWORDS ?? 'quote,quotation,freight rate,spot rate,pricing';
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function getValidDays(): number { return Number(process.env.QUOTE_DEFAULT_VALID_DAYS ?? '7'); }

function fallbackNameFromEmail(email: string) {
  const local = (email || '').split('@')[0] || 'Customer';
  return local.split('.').map(s => (s ? s[0].toUpperCase() + s.slice(1) : s)).join(' ');
}

export const quoteProcess = onMessagePublished(
  { topic: 'quote.process', memory: '512MiB', timeoutSeconds: 300 },
  async (event) => {
    const msg = event.data?.message?.data
      ? JSON.parse(Buffer.from(event.data.message.data, 'base64').toString())
      : {};
    const { provider, mailboxId, threadId, messageId, from, subject, bodyPtr } = msg as any;
    if (!provider || !mailboxId || !threadId || !messageId || !from || !bodyPtr) return;

    try {
      // 1) Check contact list: only auto-quote if sender is configured contact
      const mailboxSnap = await db.collection('mailboxes').doc(mailboxId).get();
      const orgId = (mailboxSnap.data() as any)?.orgId || 'default';
      const contacts = await db.collection('orgs').doc(orgId).collection('contacts')
        .where('autoQuote', '==', true).where('email', '==', from).limit(1).get();
      if (contacts.empty) { logger.info('quote: sender not in autoQuote contacts', { from, provider }); return; }
      const customerName = (contacts.docs[0].data() as any).name || fallbackNameFromEmail(from);

      // 2) Read text and detect intent
      const htmlBuf = await readByPtr(bodyPtr);
      const text = strip(htmlBuf.toString('utf8'));
      const intent = detectIntent(text, getKeywords());
      if (!intent.isQuoteRequest) { logger.info('quote: not a quote request', { provider }); return; }

      // 3) Parse shipment spec
      const spec = parseShipment(text);
      if (!spec.pol || !spec.pod || !spec.equipment) {
        logger.info('quote: missing essential fields', { spec, provider });
        return;
      }

      // 4) Compile rates
      const quotes = await compileQuotes({ pol: spec.pol, pod: spec.pod, equipment: spec.equipment });

      // 5) Render draft and create provider-specific reply draft
      const html = renderQuoteHtml({ customerName, spec, quotes, validDays: getValidDays() });
      if (provider === 'outlook') {
        const token = await getFreshGraphAccessTokenForMailbox(db.collection('mailboxes').doc(mailboxId).path);
        await createOutlookDraftReply({
          accessToken: token,
          replyToMessageId: messageId,
          to: from,
          subject: `Re: ${subject || 'Your freight quote'}`,
          htmlBody: html
        });
      } else if (provider === 'gmail') {
        const token = await getFreshAccessTokenForMailbox(db.collection('mailboxes').doc(mailboxId).path);
        await createGmailDraftSimpleReply({
          accessToken: token,
          threadId,
          to: from,
          subject: `Re: ${subject || 'Your freight quote'}`,
          htmlBody: html
        });
      }

      // 6) Persist a quote case document
      await db.collection('quotes').add({
        provider, mailboxId, threadId, messageId,
        customer: { name: customerName, email: from },
        spec, quotes, createdAt: Date.now()
      });

      logger.info('quote: draft created', { provider, mailboxId, messageId });
    } catch (e: any) {
      logger.error('quote: failed', { provider, err: String(e?.message || e) });
    }
  }
);
