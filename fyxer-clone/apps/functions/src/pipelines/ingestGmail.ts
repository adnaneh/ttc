import { listHistory, getMessage } from '../connectors/gmail';
import { saveMailBodyPtr } from '../util/storage';
import { db } from '../util/firestore';
import { extractHtmlFromPayload } from '../util/gmailBody';
import { PubSub } from '@google-cloud/pubsub';
import { downloadAndStoreGmailAttachments } from '../util/gmailAttachments';
import { logger } from '../util/logger';
import { parseCorrectionsFromText, applyCorrectionsFromCase } from '../util/corrections';
import { applyLabel } from '../util/labels';
import { getFreshAccessTokenForMailbox } from '../util/tokenStore';
import { logProcEvent, tempCaseIdForThread } from '../util/procEvent';

function stripHtml(s: string) {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ');
}

const pubsub = new PubSub();

export async function ingestFromGmail(accessToken: string, startHistoryId: string, mailboxId: string) {
  const history = await listHistory(accessToken, startHistoryId);

  const seen = new Set<string>();
  for (const h of history) {
    const added = (h.messagesAdded ?? []).map((x: any) => x.message?.id).filter(Boolean);
    [...new Set(added)].forEach(id => seen.add(String(id)));
  }

  for (const msgId of seen) {
    let msg: any;
    try {
      msg = await getMessage(accessToken, msgId);
    } catch (e: any) {
      const status = e?.response?.status || e?.code || '';
      const message = String(e?.message || e);
      // Gracefully skip messages that cannot be fetched (deleted or cursor drift)
      await db.collection('events').add({ type: 'gmail.message_fetch_error', mailboxId, messageId: String(msgId), status, error: message, ts: Date.now() });
      logger.warn('gmail.message_fetch_error', { messageId: String(msgId), status, error: message });
      continue;
    }
    const { html, textFallback } = extractHtmlFromPayload(msg.payload as any);
    const ptr = await saveMailBodyPtr(`mail/${mailboxId}/${msg.id}.html`, html || '<!-- empty -->');

    const headers = (msg.payload?.headers ?? []) as Array<{ name: string; value: string }>;
    const hget = (n: string) => headers.find(x => x.name.toLowerCase() === n.toLowerCase())?.value || '';
    const toList = hget('To') ? hget('To').split(',').map(s => s.trim()) : [];
    const labelIds = new Set((msg.labelIds || []) as string[]);
    const isSent = labelIds.has('SENT');
    const isDraft = labelIds.has('DRAFT');

    await db.collection('messages').doc(msg.id!).set({
      threadRef: msg.threadId,
      providerMsgId: msg.id,
      from: hget('From'),
      to: toList,
      snippet: msg.snippet ?? '',
      bodyPtr: ptr,
      sentAt: Number(msg.internalDate ?? Date.now()),
      isInbound: !isSent,
      createdAt: Date.now(),
      labelIds: Array.from(labelIds)
    }, { merge: true });

    if (msg.threadId) {
      await db.collection('threads').doc(msg.threadId).set({
        mailboxRef: mailboxId,
        providerThreadId: msg.threadId,
        participants: [hget('From'), ...toList],
        subject: hget('Subject'),
        labels: [],
        lastMessageAt: Number(msg.internalDate ?? Date.now()),
        state: labelIds.has('SENT') ? 'waiting' : 'needs_reply',
        createdAt: Date.now()
      }, { merge: true });
    }

    // Download attachments (if any) and enqueue invoice candidates (PDFs and common images)
    const stored = await downloadAndStoreGmailAttachments({
      accessToken, mailboxId, messageId: msg.id!, payload: msg.payload as any
    });

    for (const a of stored) {
      const mime = (a.mimeType || '').toLowerCase();
      const name = (a.filename || '').toLowerCase();
      const isPdf = mime.includes('pdf') || name.endsWith('.pdf');
      const isImage = mime.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');
      if ((isPdf || isImage) && msg.threadId) {
        // Log invoice.received.vendor when an invoice-like attachment arrives
        await logProcEvent({
          case_id: tempCaseIdForThread(msg.threadId),
          event_id: `invoice.received.vendor:gmail:${msg.id}`,
          activity: 'invoice.received.vendor',
          ts: Date.now(),
          source: 'email',
          provider: 'gmail',
          thread_id: msg.threadId,
          message_id: msg.id!,
          attrs: { filename: a.filename, mimeType: a.mimeType }
        });
        await pubsub.topic('invoice.process').publishMessage({
          json: { provider: 'gmail', mailboxId, threadId: msg.threadId, messageId: msg.id, attachment: a }
        });
      }
    }

    // Publish quote.process only for inbound, non-draft messages
    if (!isSent && !isDraft && msg.threadId) {
      const fromRaw = hget('From');
      const fromEmail = (fromRaw.match(/<([^>]+)>/)?.[1] || fromRaw).trim();
      await pubsub.topic('quote.process').publishMessage({
        json: {
          provider: 'gmail',
          mailboxId,
          threadId: msg.threadId,
          messageId: msg.id,
          from: fromEmail,
          subject: hget('Subject'),
          bodyPtr: ptr
        }
      });

      // Enqueue triage (labels + default reply draft)
      await pubsub.topic('triage.process').publishMessage({
        json: {
          provider: 'gmail',
          mailboxId,
          threadId: msg.threadId,
          messageId: msg.id,
          from: fromEmail,
          subject: hget('Subject'),
          bodyPtr: ptr
        }
      });
    }

    // Enqueue embeddings (skip drafts to reduce load/loops)
    if (!isDraft) {
      await pubsub.topic('mail.embed').publishMessage({ json: { mailboxId, messageId: msg.id } });
    }

    // For Sent messages: always mark thread as actioned, then parse/apply corrections once
    if (isSent) {
      if (msg.threadId) {
        const tok = await getFreshAccessTokenForMailbox(db.collection('mailboxes').doc(mailboxId).path);
        await applyLabel({ provider: 'gmail', token: tok, mailboxId, threadId: msg.threadId, messageId: msg.id!, label: 'ACTIONED' });
      }

      const textRaw = (textFallback || html || '') as string;
      const text = stripHtml(textRaw);
      const xcase = headers.find(x => x.name.toLowerCase() === 'x-fyxer-case-id')?.value;
      const { caseId, corrections } = parseCorrectionsFromText(text);

      // Debug print to help diagnose mobile send issues
      const preview = text.replace(/\s+/g, ' ').slice(0, 400);
      await db.collection('events').add({ type: 'gmail.corrections.debug', mailboxId, messageId: msg.id, headerCaseId: xcase || '', parsedCaseId: caseId || '', preview, labels: Array.from(labelIds), ts: Date.now() });

      if (caseId && Object.keys(corrections).length) {
        try {
          await applyCorrectionsFromCase(caseId, corrections);
          await db.collection('events').add({ type: 'gmail.corrections.applied', caseId, messageId: msg.id, mailboxId, ts: Date.now() });

          // Already labeled as actioned above for all sent messages
        } catch (e: any) {
          await db.collection('events').add({ type: 'gmail.corrections.error', caseId, messageId: msg.id, mailboxId, error: String(e?.message || e), ts: Date.now() });
        }
      }

      // Default reply detection (mark actioned when our default draft is sent)
      const hasDefaultHeader = headers.find(h => h.name.toLowerCase() === 'x-fyxer-default-reply')?.value === '1';
      const hasDefaultMarker = /FYXER-DEFAULT-REPLY\s*:\s*1/.test(text);
      // Already labeled as actioned above for all sent messages
    
      // Quote selection via email is disabled.

      // Emit quote.sent if there is a known quote for this thread
      if (msg.threadId) {
        const qSnap = await db.collection('quotes').where('threadId', '==', msg.threadId).limit(1).get();
        if (!qSnap.empty) {
          const q = qSnap.docs[0];
          const case_id = `Q:${q.id}`;
          await logProcEvent({
            case_id,
            event_id: `quote.sent:gmail:${msg.id}`,
            activity: 'quote.sent',
            ts: Date.now(),
            source: 'email',
            provider: 'gmail',
            actor: hget('From'),
            thread_id: msg.threadId,
            message_id: msg.id!
          });
        }
      }
    }
  }

  await db.collection('events').add({ type: 'gmail.ingest.complete', mailboxId, count: seen.size, ts: Date.now() });
  return { count: seen.size };
}
