import { listHistory, getMessage } from '../connectors/gmail';
import { saveMailBodyPtr } from '../util/storage';
import { db } from '../util/firestore';
import { MailParser } from 'mailparser';

export async function ingestFromGmail(accessToken: string, startHistoryId: string, mailboxRef: string) {
  const history = await listHistory(accessToken, startHistoryId);
  for (const h of history) {
    const msgs = [...(h.messagesAdded ?? []), ...(h.messages ?? [])];
    for (const m of msgs) {
      if (!m.message?.id) continue;
      const msg = await getMessage(accessToken, m.message.id);
      // Parse MIME -> HTML/text (simplified)
      const raw = msg.payload?.parts ? (msg.snippet ?? '') : (msg.raw ?? '');
      const parser = new MailParser();
      const buffers: Buffer[] = [];
      parser.on('data', d => { if ((d as any).type === 'text') buffers.push(Buffer.from((d as any).html || (d as any).textAsHtml || '')); });
      parser.write(Buffer.from(raw || '', 'base64'));
      parser.end();
      const htmlBody = Buffer.concat(buffers).toString('utf8');

      const ptr = await saveMailBodyPtr(`mail/${mailboxRef}/${msg.id}.html`, htmlBody);
      await db.collection('messages').doc(msg.id!).set({
        threadRef: msg.threadId,
        providerMsgId: msg.id,
        from: (msg.payload as any)?.headers?.find((h: any) => h.name === 'From')?.value ?? '',
        to: [],
        bodyPtr: ptr,
        sentAt: Number(msg.internalDate ?? Date.now()),
        isInbound: true,
        createdAt: Date.now()
      }, { merge: true });

      // enqueue next steps
      await db.collection('events').add({
        type: 'mail.stored', msgId: msg.id, threadId: msg.threadId, mailboxRef, ts: Date.now()
      });
    }
  }
}

