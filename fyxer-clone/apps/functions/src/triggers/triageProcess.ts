import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
import { db } from '../util/firestore';
import { readByPtr } from '../util/storage';
import { getFreshAccessTokenForMailbox, getFreshGraphAccessTokenForMailbox } from '../util/tokenStore';
import { setTriageLabelExclusive, addPersistentLabel } from '../util/labels';
import { getOrgCalendarConfig } from '../util/calendarConfig';
import { gcalBusyPrimary } from '../connectors/gcal';
import { outlookBusy } from '../connectors/outlookCal';
import { detectAvailabilityIntent, extractProposedSlots } from '../util/availabilityParse';
import { suggestAvailability, Slot } from '../util/availability';
import { renderAvailabilityHtml, renderAcceptanceHtml } from '../util/availabilityReply';
import { createGmailDraftSimpleReply, getMessageRfcHeaders } from '../util/gmailDraft';
import { createOutlookDraftReply } from '../util/outlookDraft';
import { makeDefaultReplyHTML } from '../util/defaultReply';
import { aiGetCalendarAvailability } from '../agents/calendarAvailability';

function strip(html: string) { return html.replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<[^>]+>/g,' '); }
function titleCaseEmailLocal(email: string) {
  const local = (email || '').split('@')[0] || 'Customer';
  return local.split(/[.\-_]/).map(s => s ? s[0].toUpperCase()+s.slice(1) : s).join(' ');
}

function isInsufficientScopeError(e: any): boolean {
  const msg = (e?.message || e?.response?.data?.error?.message || '').toString().toLowerCase();
  return msg.includes('insufficient') && msg.includes('scope');
}

export const triageProcess = onMessagePublished('triage.process', async (event) => {
  const payload = event.data?.message?.data ? JSON.parse(Buffer.from(event.data.message.data, 'base64').toString()) : {};
  const { provider, mailboxId, threadId, messageId, from, subject, bodyPtr } = payload;
  if (!provider || !mailboxId || !threadId || !messageId || !from || !bodyPtr) return;

  try {
    const html = (await readByPtr(bodyPtr)).toString('utf8');
    const text = strip(html);

    // Load org + token
    const mailboxSnap = await db.collection('mailboxes').doc(mailboxId).get();
    const orgId = (mailboxSnap.data() as any)?.orgId || 'default';
    const cfg = await getOrgCalendarConfig(orgId);
    const token = provider === 'gmail'
      ? await getFreshAccessTokenForMailbox(db.collection('mailboxes').doc(mailboxId).path)
      : await getFreshGraphAccessTokenForMailbox(db.collection('mailboxes').doc(mailboxId).path);

    // If this thread has a quote or an incoherence case -> persistent label AND set triage = TO_RESPOND
    const hasQuote = !(await db.collection('quotes').where('threadId','==',threadId).limit(1).get()).empty;
    const hasIncoh = !(await db.collection('cases').where('threadId','==',threadId).limit(1).get()).empty;

    if (hasQuote) {
      await addPersistentLabel({ provider, token, mailboxId, threadId, messageId, key: 'SPOT_RATE' });
      await setTriageLabelExclusive({ provider, token, mailboxId, threadId, messageId, key: 'TO_RESPOND' });
      return;
    }
    if (hasIncoh) {
      await addPersistentLabel({ provider, token, mailboxId, threadId, messageId, key: 'INCOHERENCE' });
      await setTriageLabelExclusive({ provider, token, mailboxId, threadId, messageId, key: 'TO_RESPOND' });
      return;
    }

    // Availability intent? If yes -> build availability draft from calendar
    const avail = detectAvailabilityIntent(text);
    if (avail.isAvailability) {
      const start = new Date();
      const end = new Date(Date.now() + cfg.lookaheadDays * 24 * 60 * 60 * 1000);
      const timeMinISO = start.toISOString();
      const timeMaxISO = end.toISOString();

      let busy: Slot[] = [];
      try {
        if (provider === 'gmail') {
          const intervals = await gcalBusyPrimary(token, timeMinISO, timeMaxISO);
          busy = intervals.map(([s, e]) => ({ startMs: s, endMs: e }));
        } else {
          const intervals = await outlookBusy(token, timeMinISO, timeMaxISO, cfg.timezone);
          busy = intervals.map(([s, e]) => ({ startMs: s, endMs: e }));
        }
      } catch (e: any) {
        if (provider === 'gmail' && isInsufficientScopeError(e)) {
          // Graceful degradation: log, label, and exit without crashing the pipeline
          await db.collection('events').add({ type: 'availability.missing_scope', error: String(e?.message || e), mailboxId, provider, threadId, messageId, ts: Date.now() });
          logger.error('availability.calendar_scope_missing', { err: String(e?.message || e) });
          await setTriageLabelExclusive({ provider, token, mailboxId, threadId, messageId, key: 'TO_RESPOND' });
          return;
        }
        throw e;
      }

      // If the sender proposed explicit slots, prefer those that fit our calendar
      const proposals = extractProposedSlots(text, cfg.timezone);
      const nowMs = Date.now();
      const minNoticeMs = cfg.minNoticeMin * 60 * 1000;
      const withinNotice = (s: Slot) => s.startMs >= (nowMs + minNoticeMs);
      const overlap = (a: Slot, b: Slot) => !(a.endMs <= b.startMs || a.startMs >= b.endMs);

      let slots: Slot[] = proposals.slots.length
        ? proposals.slots
            .slice()
            .filter(withinNotice)
            .sort((a, b) => a.startMs - b.startMs)
            .filter(s => busy.every(b => !overlap(s, b)))
        : [];

      const customerName = titleCaseEmailLocal(from);
      let htmlBody: string;
      if (slots.length) {
        // Accept the first conflict-free proposed time
        htmlBody = renderAcceptanceHtml({ customerName, tz: proposals.displayTz || cfg.timezone, slot: slots[0] });
      } else {
        // If no valid proposal, compute suggestions; try agent first, then fall back
        let sugg: Slot[] = [];
        try {
          const suggested = await aiGetCalendarAvailability({
            text,
            timezone: cfg.timezone,
            lookaheadDays: cfg.lookaheadDays,
            cfg: {
              minNoticeMin: cfg.minNoticeMin,
              workDays: cfg.workDays,
              workStartMin: cfg.workStartMin,
              workEndMin: cfg.workEndMin,
              durationMin: cfg.durationMin,
              slotIncrementMin: cfg.slotIncrementMin,
              suggestCount: cfg.suggestCount,
              timezone: cfg.timezone,
            },
            gcalBusy: provider === 'gmail' ? async ({ startMs, endMs }) => {
              const intervals = await gcalBusyPrimary(token, new Date(startMs).toISOString(), new Date(endMs).toISOString());
              return intervals.map(([s, e]) => ({ startMs: s, endMs: e }));
            } : null,
            outlookBusy: provider !== 'gmail' ? async ({ startMs, endMs, timezone }) => {
              const intervals = await outlookBusy(token, new Date(startMs).toISOString(), new Date(endMs).toISOString(), timezone || cfg.timezone);
              return intervals.map(([s, e]) => ({ startMs: s, endMs: e }));
            } : null,
          });
          sugg = (suggested?.suggestedTimes || []) as Slot[];
        } catch (e) {
          // degrade to local suggestion below
          logger.warn('availability.agent_failed', { err: String((e as any)?.message || e) });
        }

        if (!sugg.length) {
          // Fall back to our own suggestions if agent yields nothing
          sugg = suggestAvailability(busy, cfg, avail.constraints);
        }

        htmlBody = renderAvailabilityHtml({ customerName, tz: proposals.displayTz || cfg.timezone, slots: sugg });
      }

      if (provider === 'gmail') {
        // Build RFC reply headers from the specific message and honor Reply-To
        const { messageId: rfcId, references, replyTo: rfcReplyTo, from: rfcFrom } = await getMessageRfcHeaders({ accessToken: token, messageId });
        const extra = rfcId ? { 'In-Reply-To': rfcId, 'References': (references ? `${references} ` : '') + rfcId } : undefined;
        const targetTo = (rfcReplyTo || rfcFrom || from);
        // Keep the exact original subject (can be empty)
        await createGmailDraftSimpleReply({ accessToken: token, threadId, to: targetTo, subject: subject || '', htmlBody, extraHeaders: extra });
      } else {
        await createOutlookDraftReply({ accessToken: token, replyToMessageId: messageId, to: from, subject: `Re: ${subject || 'Availability'}`, htmlBody });
      }

      await setTriageLabelExclusive({ provider, token, mailboxId, threadId, messageId, key: 'TO_RESPOND' });
      await db.collection('events').add({ type: 'availability.drafted', mailboxId, provider, threadId, messageId, ts: Date.now() });
      return;
    }

    // FYI vs TO_RESPOND heuristic; if to respond, draft default reply
    const noreply = /no[-\s]?reply|donotreply|do[-\s]?not[-\s]?reply/i.test(from);
    const shortInfo = text.length < 180 && !/[?]/.test(text);

    if (noreply || shortInfo) {
      await setTriageLabelExclusive({ provider, token, mailboxId, threadId, messageId, key: 'FYI' });
      return;
    } else {
      const customerName = titleCaseEmailLocal(from);
      const replyHtml = await makeDefaultReplyHTML({ customerName, subject, plainText: text });
      if (provider === 'gmail') {
        const { messageId: rfcId, references, replyTo: rfcReplyTo, from: rfcFrom } = await getMessageRfcHeaders({ accessToken: token, messageId });
        const targetTo = (rfcReplyTo || rfcFrom || from);
        const extraHeaders: Record<string, string> = rfcId
          ? { 'In-Reply-To': rfcId, 'References': (references ? `${references} ` : '') + rfcId, 'X-Fyxer-Default-Reply': '1' }
          : { 'X-Fyxer-Default-Reply': '1' };
        await createGmailDraftSimpleReply({ accessToken: token, threadId, to: targetTo, subject: subject || '', htmlBody: replyHtml, extraHeaders });
      } else {
        await createOutlookDraftReply({ accessToken: token, replyToMessageId: messageId, to: from, subject: `Re: ${subject || ''}`.trim(), htmlBody: replyHtml });
      }
      await setTriageLabelExclusive({ provider, token, mailboxId, threadId, messageId, key: 'TO_RESPOND' });
      return;
    }
  } catch (e: any) {
    await db.collection('events').add({ type: 'triage.error', error: String(e?.message || e), mailboxId, threadId, messageId, ts: Date.now() });
    logger.error('triage.process failed', { err: String(e?.message || e) });
  }
});
