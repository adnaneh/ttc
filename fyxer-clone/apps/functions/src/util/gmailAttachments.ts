import { gmailClientFromAccessToken } from '../connectors/gmail';
import { saveMailBodyPtr } from './storage';

type Part = { filename?: string; mimeType?: string; body?: { attachmentId?: string; data?: string }; parts?: Part[] };

function walkParts(p?: Part, out: Part[] = []) {
  if (!p) return out;
  if (p.filename && p.body?.attachmentId) out.push(p);
  (p.parts || []).forEach(child => walkParts(child, out));
  return out;
}

export async function downloadAndStoreGmailAttachments(params: {
  accessToken: string;
  mailboxId: string;
  messageId: string;
  payload: Part;
}) {
  const { accessToken, mailboxId, messageId, payload } = params;
  const gmail = gmailClientFromAccessToken(accessToken);
  const attachments = walkParts(payload);
  const stored: Array<{ filename: string; mimeType?: string; ptr: string }> = [];

  for (const a of attachments) {
    const attId = a.body!.attachmentId!;
    const res = await gmail.users.messages.attachments.get({ userId: 'me', messageId, id: attId });
    const data = (res.data as any).data || '';
    const buf = Buffer.from(String(data).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const safeName = encodeURIComponent(a.filename || 'file');
    const path = `attachments/${mailboxId}/${messageId}/${safeName}`;
    const ptr = await saveMailBodyPtr(path, buf);
    stored.push({ filename: a.filename || 'file', mimeType: a.mimeType, ptr });
  }
  return stored;
}

