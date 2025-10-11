import { listHistory, getMessage } from '../connectors/gmail';
import { saveMailBodyPtr } from '../util/storage';
import { db } from '../util/firestore';
import { extractHtmlFromPayload } from '../util/gmailBody';
import { PubSub } from '@google-cloud/pubsub';
import { downloadAndStoreGmailAttachments } from '../util/gmailAttachments';

const pubsub = new PubSub();

export async function ingestFromGmail(accessToken: string, startHistoryId: string, mailboxId: string) {
  const history = await listHistory(accessToken, startHistoryId);

  const seen = new Set<string>();
  for (const h of history) {
    const added = (h.messagesAdded ?? []).map((x: any) => x.message?.id).filter(Boolean);
    const updated = (h.messages ?? []).map((x: any) => x.id).filter(Boolean);
    [...new Set([...added, ...updated])].forEach(id => seen.add(String(id)));
  }

  for (const msgId of seen) {
    const msg = await getMessage(accessToken, msgId);
    const { html } = extractHtmlFromPayload(msg.payload as any);
    const ptr = await saveMailBodyPtr(`mail/${mailboxId}/${msg.id}.html`, html || '<!-- empty -->');

    const headers = (msg.payload?.headers ?? []) as Array<{ name: string; value: string }>;
    const hget = (n: string) => headers.find(x => x.name.toLowerCase() === n.toLowerCase())?.value || '';
    const toList = hget('To') ? hget('To').split(',').map(s => s.trim()) : [];
    const labelIds = new Set((msg.labelIds || []) as string[]);

    await db.collection('messages').doc(msg.id!).set({
      threadRef: msg.threadId,
      providerMsgId: msg.id,
      from: hget('From'),
      to: toList,
      snippet: msg.snippet ?? '',
      bodyPtr: ptr,
      sentAt: Number(msg.internalDate ?? Date.now()),
      isInbound: !labelIds.has('SENT'),
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

    // Download attachments (if any) and enqueue PDFs
    const stored = await downloadAndStoreGmailAttachments({
      accessToken, mailboxId, messageId: msg.id!, payload: msg.payload as any
    });

    for (const a of stored) {
      const isPdf = (a.mimeType || '').includes('pdf') || (a.filename || '').toLowerCase().endsWith('.pdf');
      if (isPdf && msg.threadId) {
        await pubsub.topic('invoice.process').publishMessage({
          json: { provider: 'gmail', mailboxId, threadId: msg.threadId, messageId: msg.id, attachment: a }
        });
      }
    }

    // Enqueue embeddings as before
    await pubsub.topic('mail.embed').publishMessage({ json: { mailboxId, messageId: msg.id } });
  }

  await db.collection('events').add({ type: 'gmail.ingest.complete', mailboxId, count: seen.size, ts: Date.now() });
  return { count: seen.size };
}
