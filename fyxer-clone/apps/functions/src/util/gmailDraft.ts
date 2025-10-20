import { gmailClientFromAccessToken } from '../connectors/gmail';

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

// Helper to fetch RFC822 headers for a specific Gmail message
export async function getMessageRfcHeaders(params: { accessToken: string; messageId: string }) {
  const gmail = gmailClientFromAccessToken(params.accessToken);
  try {
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: params.messageId,
      format: 'metadata',
      metadataHeaders: ['Message-Id', 'References']
    });
    const headers = (msg.data.payload?.headers || []) as Array<{ name?: string; value?: string }>;
    const messageId = headers.find(h => (h.name || '').toLowerCase() === 'message-id')?.value || '';
    const references = headers.find(h => (h.name || '').toLowerCase() === 'references')?.value || '';
    return { messageId, references };
  } catch {
    return { messageId: '', references: '' };
  }
}

// Note: We do not compute reply headers without a target message. Provide them from caller when needed.

export async function createGmailDraftReply(params: {
  accessToken: string;
  threadId: string;
  to: string;
  subject: string;
  inReplyTo?: string;   // Message-Id to preserve thread (optional when threadId is set)
  references?: string;  // Full References chain if available
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

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { threadId: params.threadId, raw: b64url(raw) } }
  });
  return res.data;
}
