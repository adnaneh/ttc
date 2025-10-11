import { listHistory, getMessage } from '../connectors/gmail';
import { saveMailBodyPtr } from '../util/storage';
import { db } from '../util/firestore';
import { extractHtmlFromPayload } from '../util/gmailBody';
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();

export async function ingestFromGmail(accessToken: string, startHistoryId: string, mailboxId: string) {
  const history = await listHistory(accessToken, startHistoryId);

  const toProcess: Array<{ msgId: string; threadId?: string }> = [];
  for (const h of history) {
    const added = (h.messagesAdded ?? []).map((x: any) => x.message?.id).filter(Boolean);
    const updated = (h.messages ?? []).map((x: any) => x.id).filter(Boolean);
    [...new Set([...added, ...updated])].forEach((id: string) => toProcess.push({ msgId: id }));
  }

  for (const item of toProcess) {
    const msg = await getMessage(accessToken, item.msgId);
    const { html } = extractHtmlFromPayload(msg.payload as any);

    const ptr = await saveMailBodyPtr(`mail/${mailboxId}/${msg.id}.html`, html || '<!-- empty -->');

    const headers = (msg.payload?.headers ?? []) as Array<{ name: string; value: string }>;
    const h = (n: string) => headers.find(x => x.name.toLowerCase() === n.toLowerCase())?.value || '';
    const toList = h('To') ? h('To').split(',').map(s => s.trim()) : [];

    await db.collection('messages').doc(msg.id!).set({
      threadRef: msg.threadId,
      providerMsgId: msg.id,
      from: h('From'),
      to: toList,
      snippet: msg.snippet ?? '',
      bodyPtr: ptr,
      sentAt: Number(msg.internalDate ?? Date.now()),
      isInbound: true,
      createdAt: Date.now()
    }, { merge: true });

    // Upsert thread metadata
    if (msg.threadId) {
      await db.collection('threads').doc(msg.threadId).set({
        mailboxRef: mailboxId,
        providerThreadId: msg.threadId,
        participants: [h('From'), ...toList],
        subject: h('Subject'),
        labels: [],
        lastMessageAt: Number(msg.internalDate ?? Date.now()),
        state: 'needs_reply',
        createdAt: Date.now()
      }, { merge: true });
    }

    // Enqueue for embedding
    await pubsub.topic('mail.embed').publishMessage({ json: { mailboxId, messageId: msg.id } });
  }

  // event log
  await db.collection('events').add({ type: 'gmail.ingest.complete', mailboxId, count: toProcess.length, ts: Date.now() });

  return { count: toProcess.length };
}

