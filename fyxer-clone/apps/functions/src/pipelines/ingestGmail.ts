import { listHistory, getMessage } from '../connectors/gmail';
import { saveMailBodyPtr } from '../util/storage';
import { db } from '../util/firestore';
import { extractHtmlFromPayload } from '../util/gmailBody';
import { PubSub } from '@google-cloud/pubsub';
import { downloadAndStoreGmailAttachments } from '../util/gmailAttachments';
import { logger } from '../util/logger';
import { parseCorrectionsFromText, applyCorrectionsFromCase } from '../util/corrections';
import { findSelectedOptionId } from '../util/quoteCorrections';

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
    const msg = await getMessage(accessToken, msgId);
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
    }

    // Enqueue embeddings (skip drafts to reduce load/loops)
    if (!isDraft) {
      await pubsub.topic('mail.embed').publishMessage({ json: { mailboxId, messageId: msg.id } });
    }

    // For Sent messages: parse and apply corrections exactly once via history
    if (isSent) {
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
        } catch (e: any) {
          await db.collection('events').add({ type: 'gmail.corrections.error', caseId, messageId: msg.id, mailboxId, error: String(e?.message || e), ts: Date.now() });
        }
      }

      // Quote selection processing on Sent: use header and body marker
      const xquote = headers.find(h => h.name?.toLowerCase() === 'x-fyxer-quote-id')?.value;
      if (xquote) {
        try {
          const qdoc = await db.collection('quotes').doc(xquote).get();
          if (qdoc.exists) {
            const qd = qdoc.data() as any;
            if (!(qd?.status === 'sent' && qd?.sentMessageId)) {
              const selectedId = findSelectedOptionId(text) || 'QOPT-1';
              const options = (qd.options || []) as Array<any>;
              const selected = options.find(o => o.id === selectedId) || options[0] || null;

              await qdoc.ref.update({
                status: 'sent',
                sentAt: Date.now(),
                sentMessageId: msg.id,
                selectedOptionId: selected?.id || null,
                selectedOption: selected || null
              });

              await db.collection('events').add({
                type: 'quote.sent',
                quoteId: xquote,
                selectedOptionId: selected?.id || null,
                mailboxId,
                messageId: msg.id,
                ts: Date.now()
              });
            }
          }
        } catch (e: any) {
          await db.collection('events').add({ type: 'gmail.quote.sent.error', mailboxId, messageId: msg.id, quoteId: xquote, error: String(e?.message || e), ts: Date.now() });
        }
      }
    }
  }

  await db.collection('events').add({ type: 'gmail.ingest.complete', mailboxId, count: seen.size, ts: Date.now() });
  return { count: seen.size };
}
