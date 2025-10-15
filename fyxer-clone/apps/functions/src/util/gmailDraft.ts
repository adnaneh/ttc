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

export async function createGmailDraftReply(params: {
  accessToken: string;
  threadId: string;
  to: string;
  subject: string;
  inReplyTo?: string;   // Message-Id to preserve thread (optional when threadId is set)
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
    headers['References'] = params.inReplyTo;
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
}) {
  const gmail = gmailClientFromAccessToken(params.accessToken);
  const plain = params.htmlBody
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const raw = composeAltMime(
    { To: params.to, Subject: params.subject },
    plain || 'See HTML version.',
    params.htmlBody
  );

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { threadId: params.threadId, raw: b64url(raw) } }
  });
  return res.data;
}
