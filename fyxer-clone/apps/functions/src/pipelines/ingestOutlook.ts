import { db } from '../util/firestore';
import { saveMailBodyPtr } from '../util/storage';
import { messagesDelta, getMessage } from '../connectors/outlook';
import { PubSub } from '@google-cloud/pubsub';

const pubsub = new PubSub();

function addr(a?: { emailAddress?: { address?: string; name?: string } }) {
  return a?.emailAddress?.address || '';
}
function list(recipients?: Array<{ emailAddress: { address: string } }>) {
  return (recipients ?? []).map(r => r.emailAddress.address);
}

/**
 * Process changes since last deltaLink and update mailbox.sync.deltaLink.
 * If deltaLink is missing, this initializes it without backfilling historical emails.
 */
export async function ingestOutlookChanges(accessToken: string, mailboxId: string) {
  const mailboxRef = db.collection('mailboxes').doc(mailboxId);
  const mailboxSnap = await mailboxRef.get();
  if (!mailboxSnap.exists) throw new Error('Mailbox not found');
  const mailbox = mailboxSnap.data() as any;
  let next: string | undefined = mailbox.sync?.deltaLink;
  let delta: string | undefined;
  let processed = 0;

  // If no deltaLink, initialize it WITHOUT ingesting historical messages
  if (!next) {
    let page = await messagesDelta(accessToken);
    while (page['@odata.nextLink']) {
      page = await messagesDelta(accessToken, page['@odata.nextLink']);
    }
    delta = page['@odata.deltaLink'];
    await mailboxRef.update({ 'sync.deltaLink': delta });
    return { initialized: true, processed: 0 };
  }

  // Process changes since last deltaLink
  let page = await messagesDelta(accessToken, next);
  while (true) {
    for (const m of page.value) {
      const id = m.id as string;
      // Ensure we have body; if delta omitted it, fetch full
      const msg = m.body?.content ? m : await getMessage(accessToken, id);
      const html = (msg.body?.content as string) || '<!-- empty -->';
      const ptr = await saveMailBodyPtr(`mail/${mailboxId}/${id}.html`, html);

      const from = addr(msg.from);
      const to = list(msg.toRecipients);
      const subject = String(msg.subject || '');
      const receivedMs = Date.parse(msg.receivedDateTime || new Date().toISOString()) || Date.now();

      await db.collection('messages').doc(id).set({
        threadRef: msg.conversationId,
        providerMsgId: id,
        from,
        to,
        snippet: subject.slice(0, 140),
        bodyPtr: ptr,
        sentAt: receivedMs,
        isInbound: true,
        createdAt: Date.now()
      }, { merge: true });

      await db.collection('threads').doc(msg.conversationId).set({
        mailboxRef: mailboxId,
        providerThreadId: msg.conversationId,
        participants: [from, ...to],
        subject,
        labels: [],
        lastMessageAt: receivedMs,
        state: 'needs_reply',
        createdAt: Date.now()
      }, { merge: true });

      await pubsub.topic('mail.embed').publishMessage({ json: { mailboxId, messageId: id } });
      processed++;
    }

    if (page['@odata.nextLink']) {
      page = await messagesDelta(accessToken, page['@odata.nextLink']);
      continue;
    }
    delta = page['@odata.deltaLink'];
    break;
  }

  if (delta) {
    await mailboxRef.update({ 'sync.deltaLink': delta });
  }

  await db.collection('events').add({ type: 'outlook.ingest.complete', mailboxId, count: processed, ts: Date.now() });
  return { initialized: false, processed };
}

