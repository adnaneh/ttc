import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
import { db } from '../util/firestore';
import { readByPtr } from '../util/storage';
import { detectIntent, parseShipmentSmart } from '../util/quoteParse';
import { compileQuotes } from '../util/quoteSources';
import { renderQuoteHtml, numberQuoteOptions } from '../util/quoteEmail';
import { getFreshGraphAccessTokenForMailbox, getFreshAccessTokenForMailbox } from '../util/tokenStore';
import { createOutlookDraftReply } from '../util/outlookDraft';
import { createGmailDraftSimpleReply } from '../util/gmailDraft';
import { orgFeature } from '../util/orgFeatures';
import { addPersistentLabel, setTriageLabelExclusive } from '../util/labels';

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
      // Idempotency: skip if we've already created a quote for this message
      const dup = await db.collection('quotes').where('messageId', '==', messageId).limit(1).get();
      if (!dup.empty) { logger.info('quote: already processed, skipping', { provider, mailboxId, messageId }); return; }

      // 1) Load org for features; quote flow is not restricted to a contacts list
      const mailboxSnap = await db.collection('mailboxes').doc(mailboxId).get();
      const orgId = (mailboxSnap.data() as any)?.orgId || 'default';
      const customerName = fallbackNameFromEmail(from);

      // 2) Read text and detect intent
      const htmlBuf = await readByPtr(bodyPtr);
      const text = strip(htmlBuf.toString('utf8'));
      const intent = detectIntent(text, getKeywords());
      if (!intent.isQuoteRequest) { logger.info('quote: not a quote request', { provider }); return; }

      // 3) Parse shipment spec (regex + optional LLM)
      const llmEnabled = await orgFeature(orgId, 'llmParseQuotes', false);
      const spec = await parseShipmentSmart({ orgId, text, llmEnabled });
      if (!spec.pol || !spec.pod || !spec.equipment) {
        logger.info('quote: missing essential fields', { spec, provider });
        return;
      }

      // 4) Compile rates and number options
      const baseQuotes = await compileQuotes({ pol: spec.pol, pod: spec.pod, equipment: spec.equipment });
      const quotes = numberQuoteOptions(baseQuotes);

      // Create a new quote document with a stable id; embed this id into the draft body as a marker
      const quoteRef = db.collection('quotes').doc();
      const quoteId = quoteRef.id;

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
        // Labels: persistent + triage to respond
        await addPersistentLabel({ provider: 'outlook', token, mailboxId, threadId, messageId, key: 'SPOT_RATE' });
        await setTriageLabelExclusive({ provider: 'outlook', token, mailboxId, threadId, messageId, key: 'TO_RESPOND' });
      } else if (provider === 'gmail') {
        const token = await getFreshAccessTokenForMailbox(db.collection('mailboxes').doc(mailboxId).path);
        await createGmailDraftSimpleReply({
          accessToken: token,
          threadId,
          to: from,
          // Keep subject identical to original when present to maximize threading compatibility
          subject: subject || 'Your freight quote',
          htmlBody: html
        });
        await addPersistentLabel({ provider: 'gmail', token, mailboxId, threadId, messageId, key: 'SPOT_RATE' });
        await setTriageLabelExclusive({ provider: 'gmail', token, mailboxId, threadId, messageId, key: 'TO_RESPOND' });
      }

      // 6) Persist a quote case document
      await quoteRef.set({
        status: 'drafted',
        provider, mailboxId, threadId, messageId,
        customer: { name: customerName, email: from },
        spec, options: quotes, createdAt: Date.now()
      });

      logger.info('quote: draft created', { provider, mailboxId, messageId, quoteId });
    } catch (e: any) {
      logger.error('quote: failed', { provider, err: String(e?.message || e) });
    }
  }
);
