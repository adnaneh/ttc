import { db } from '../util/firestore';
import { saveMailBodyPtr } from '../util/storage';
import { messagesDelta, getMessage } from '../connectors/outlook';
import { PubSub } from '@google-cloud/pubsub';
import { downloadAndStoreOutlookAttachments } from '../util/outlookAttachments';
import { parseCorrectionsFromText, applyCorrectionsFromCase } from '../util/corrections';

const pubsub = new PubSub();

function addr(a?: { emailAddress?: { address?: string; name?: string } }) {
  return a?.emailAddress?.address || '';
}
function list(recipients?: Array<{ emailAddress: { address: string } }>) {
  return (recipients ?? []).map(r => r.emailAddress.address);
}

function stripHtml(html = '') { return html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' '); }

/**
 * Process changes since last deltaLink for a given folder ('Inbox' or 'SentItems').
 * - For Inbox: normal ingest + download attachments + enqueue invoice.process (provider: 'outlook')
 * - For SentItems: parse corrections and apply to SAP HANA when case block is present
 */
export async function ingestOutlookFolderChanges(accessToken: string, mailboxId: string, folder: 'Inbox'|'SentItems') {
  const mailboxRef = db.collection('mailboxes').doc(mailboxId);
  const mailboxSnap = await mailboxRef.get();
  if (!mailboxSnap.exists) throw new Error('Mailbox not found');
  const mailbox = mailboxSnap.data() as any;

  const syncKey = folder === 'Inbox' ? 'inbox' : 'sent';
  let next: string | undefined = mailbox.sync?.[syncKey]?.deltaLink;
  let delta: string | undefined;
  let processed = 0;

  // If no deltaLink, initialize without backfilling
  if (!next) {
    let page = await messagesDelta(accessToken, undefined, folder);
    while (page['@odata.nextLink']) page = await messagesDelta(accessToken, page['@odata.nextLink'], folder);
    delta = page['@odata.deltaLink'];
    await mailboxRef.update({ [`sync.${syncKey}.deltaLink`]: delta });
    return { initialized: true, processed: 0 };
  }

  // Process changes
  let page = await messagesDelta(accessToken, next, folder);
  while (true) {
    for (const m of page.value) {
      const id = m.id as string;
      // Ensure body exists; delta might omit it
      const msg = m.body?.content ? m : await getMessage(accessToken, id);
      const html = (msg.body?.content as string) || '<!-- empty -->';
      const ptr = await saveMailBodyPtr(`mail/${mailboxId}/${id}.html`, html);

      const from = addr(msg.from);
      const toArr = list(msg.toRecipients);
      const subject = String(msg.subject || '');
      const receivedMs = Date.parse(msg.receivedDateTime || new Date().toISOString()) || Date.now();

      await db.collection('messages').doc(id).set({
        threadRef: msg.conversationId,
        providerMsgId: id,
        from,
        to: toArr,
        snippet: subject.slice(0, 140),
        bodyPtr: ptr,
        sentAt: receivedMs,
        isInbound: folder === 'Inbox',
        createdAt: Date.now()
      }, { merge: true });

      await db.collection('threads').doc(msg.conversationId).set({
        mailboxRef: mailboxId,
        providerThreadId: msg.conversationId,
        participants: [from, ...toArr],
        subject,
        labels: [],
        lastMessageAt: receivedMs,
        state: folder === 'Inbox' ? 'needs_reply' : 'waiting',
        createdAt: Date.now()
      }, { merge: true });

      // Inbox: download attachments and enqueue invoice candidates (PDFs and common images)
      if (folder === 'Inbox') {
        const { attachments } = await downloadAndStoreOutlookAttachments({ accessToken, mailboxId, messageId: id });
        for (const a of attachments) {
          const mime = (a.mimeType || '').toLowerCase();
          const name = (a.filename || '').toLowerCase();
          const isPdf = mime.includes('pdf') || name.endsWith('.pdf');
          const isImage = mime.startsWith('image/') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');
          if (isPdf || isImage) {
            await pubsub.topic('invoice.process').publishMessage({
              json: { provider: 'outlook', mailboxId, threadId: msg.conversationId, messageId: id, attachment: a }
            });
          }
        }

        // Inbox: enqueue for quote processing (qualifies inside the processor)
        await pubsub.topic('quote.process').publishMessage({
          json: {
            provider: 'outlook',
            mailboxId,
            threadId: msg.conversationId,
            messageId: id,
            from,
            subject,
            bodyPtr: ptr
          }
        });
      }

      // SentItems: parse corrections and apply to SAP HANA if present
      if (folder === 'SentItems') {
        const text = stripHtml(html);
        const { caseId, corrections } = parseCorrectionsFromText(text);
        if (caseId && Object.keys(corrections).length) {
          try {
            await applyCorrectionsFromCase(caseId, corrections);
            await db.collection('events').add({ type: 'outlook.corrections.applied', mailboxId, messageId: id, caseId, ts: Date.now() });
          } catch (e: any) {
            await db.collection('events').add({ type: 'outlook.corrections.error', mailboxId, messageId: id, caseId, error: String(e?.message || e), ts: Date.now() });
          }
        }
      }

      // Always embed for RAG
      await pubsub.topic('mail.embed').publishMessage({ json: { mailboxId, messageId: id } });
      processed++;
    }

    if (page['@odata.nextLink']) { page = await messagesDelta(accessToken, page['@odata.nextLink'], folder); continue; }
    delta = page['@odata.deltaLink'];
    break;
  }

  if (delta) await mailboxRef.update({ [`sync.${syncKey}.deltaLink`]: delta });

  await db.collection('events').add({ type: `outlook.ingest.${folder}.complete`, mailboxId, count: processed, ts: Date.now() });
  return { initialized: false, processed };
}
