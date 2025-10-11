import { getMessageWithAttachments } from '../connectors/outlook';
import { saveBinaryPtr, saveToGCSStream } from './storage';
import { Readable } from 'node:stream';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const STREAM_THRESHOLD = 2 * 1024 * 1024; // 2MB

type FileLike = {
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  isInline?: boolean;
  contentBytes?: string;
  ['@odata.type']?: string;
  contentId?: string;
  contentLocation?: string;
  sourceUrl?: string;
  contentUrl?: string;
  previewUrl?: string;
};

function pickDownloadUrl(a: FileLike): string | undefined {
  return a.contentLocation || (a as any).contentUrl || (a as any).sourceUrl || (a as any).previewUrl;
}

export async function downloadAndStoreOutlookAttachments(params: {
  accessToken: string;
  mailboxId: string;
  messageId: string;
}) {
  const { accessToken, mailboxId, messageId } = params;
  const msg = await getMessageWithAttachments(accessToken, messageId);
  const attachments = (msg.attachments || []) as FileLike[];

  const stored: Array<{ filename: string; mimeType?: string; ptr: string }> = [];

  for (const a of attachments) {
    if (a.isInline) continue;

    const filename = a.name || 'file';
    const mime = a.contentType || 'application/octet-stream';
    const safeName = encodeURIComponent(filename);
    const path = `attachments/${mailboxId}/${messageId}/${safeName}`;
    const size = Number(a.size || 0);
    const odataType = a['@odata.type'] || '';

    // Small inline contentBytes
    if (a.contentBytes && size > 0 && size <= STREAM_THRESHOLD) {
      const buf = Buffer.from(a.contentBytes, 'base64');
      const ptr = await saveBinaryPtr(path, buf, mime);
      stored.push({ filename, mimeType: mime, ptr });
      continue;
    }

    const tryValue = odataType.endsWith('.fileAttachment') || (!odataType && typeof a.contentBytes === 'undefined');
    if (tryValue && a.id) {
      const res = await fetch(`${GRAPH}/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(a.id)}/$value`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (res.ok) {
        if (res.body) {
          const nodeStream = Readable.fromWeb(res.body as any);
          const ptr = await saveToGCSStream(path, nodeStream, mime);
          stored.push({ filename, mimeType: mime, ptr });
          continue;
        } else {
          const ab = await res.arrayBuffer();
          const ptr = await saveBinaryPtr(path, Buffer.from(ab), mime);
          stored.push({ filename, mimeType: mime, ptr });
          continue;
        }
      }
    }

    const refUrl = pickDownloadUrl(a);
    if (refUrl) {
      const r2 = await fetch(refUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (r2.ok) {
        if (r2.body) {
          const nodeStream = Readable.fromWeb(r2.body as any);
          const ptr = await saveToGCSStream(path, nodeStream, mime);
          stored.push({ filename, mimeType: mime, ptr });
          continue;
        } else {
          const ab = await r2.arrayBuffer();
          const ptr = await saveBinaryPtr(path, Buffer.from(ab), mime);
          stored.push({ filename, mimeType: mime, ptr });
          continue;
        }
      }
      continue;
    }
    // Unsupported (itemAttachment without content)
  }

  return { message: msg, attachments: stored };
}
