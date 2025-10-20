import { gmailClientFromAccessToken } from '../connectors/gmail';
import { db } from './firestore';

function b64url(b: Buffer | string) {
  const buf = Buffer.isBuffer(b) ? b : Buffer.from(b, 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function composeAltMime(headers: Record<string, string>, text: string, html: string) {
  const boundary = '====fyxer_alt_' + Math.random().toString(36).slice(2);
  const head = Object.entries(headers).map(([k,v]) => `${k}: ${v}`).join('\r\n') + `\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`;
  const body =
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}\r\n\r\n` +
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n\r\n` +
    `--${boundary}--`;
  return head + body;
}

export async function createGmailDraftReply(params: {
  accessToken: string;
  threadId: string;
  to: string;
  subject: string;
  inReplyTo?: string;   // Message-Id to preserve thread (optional when threadId is set)
  references?: string;  // Optional full References chain; falls back to inReplyTo
  caseId: string;
  textBody: string;
  htmlBody: string;
}) {
  const gmail = gmailClientFromAccessToken(params.accessToken);
  const headers: Record<string, string> = {
    To: params.to,
    Subject: params.subject,
    'X-Fyxer-Case-Id': params.caseId
  };
  if (params.inReplyTo) {
    headers['In-Reply-To'] = params.inReplyTo;
    headers['References'] = params.references || params.inReplyTo;
  }
  const raw = composeAltMime(headers, params.textBody, params.htmlBody);
  try {
    const headerRaw = raw.split('\r\n\r\n')[0];
    await db.collection('events').add({
      type: 'gmail.draft.debug_headers',
      context: 'createGmailDraftReply',
      threadId: params.threadId,
      to: params.to,
      subject: params.subject,
      headers: headerRaw,
      ts: Date.now()
    });
  } catch {}
  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { threadId: params.threadId, raw: b64url(raw) } }
  });
  return res.data;
}

export async function createGmailDraftSimpleReply(params: {
  accessToken: string;
  threadId: string;
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  extraHeaders?: Record<string, string>;
}) {
  const gmail = gmailClientFromAccessToken(params.accessToken);
  const plain = (params.textBody ?? params.htmlBody)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const headers: Record<string, string> = { To: params.to, Subject: params.subject, ...(params.extraHeaders || {}) };
  const raw = composeAltMime(headers, plain || 'See HTML version.', params.htmlBody);
  try {
    const headerRaw = raw.split('\r\n\r\n')[0];
    await db.collection('events').add({
      type: 'gmail.draft.debug_headers',
      context: 'createGmailDraftSimpleReply',
      threadId: params.threadId,
      to: params.to,
      subject: params.subject,
      headers: headerRaw,
      ts: Date.now()
    });
  } catch {}

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { threadId: params.threadId, raw: b64url(raw) } }
  });
  return res.data;
}

// Build robust reply headers from the last message in a Gmail thread.
// Always points In-Reply-To to the latest message-id and constructs a compact
// References chain from recent messages to maximize threading reliability.
export async function buildGmailReplyHeaders(params: {
  accessToken: string;
  threadId: string;
}): Promise<Record<string, string>> {
  const gmail = gmailClientFromAccessToken(params.accessToken);
  const thread = await gmail.users.threads.get({
    userId: 'me',
    id: params.threadId,
    format: 'metadata',
    metadataHeaders: ['Message-Id', 'References']
  });

  const messages = thread.data.messages || [];
  if (!messages.length) return {};

  const getH = (m: any, n: string) =>
    (m.payload?.headers || []).find((x: any) => (x.name || '').toLowerCase() === n.toLowerCase())?.value || '';

  const last = messages[messages.length - 1];
  const parentMsgId = getH(last, 'Message-Id');

  // Build compact References: up to last 15 message-ids in order
  const ids = messages.map(m => getH(m, 'Message-Id')).filter(Boolean);
  const tail = ids.slice(-15).join(' ').trim();
  const priorRefs = getH(last, 'References');
  const references = [priorRefs, tail].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

  const out: Record<string, string> = {};
  if (parentMsgId) out['In-Reply-To'] = parentMsgId;
  if (references) out['References'] = references;
  return out;
}
