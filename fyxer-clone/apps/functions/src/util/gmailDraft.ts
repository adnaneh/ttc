import { gmailClientFromAccessToken } from '../connectors/gmail';
import MailComposer from 'nodemailer/lib/mail-composer';
import type Mail from 'nodemailer/lib/mailer';
import type { Attachment } from 'nodemailer/lib/mailer';

function encodeMessage(message: Buffer) {
  return Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function createMail(options: Mail.Options) {
  const composer = new MailComposer(options);
  const compiled = await composer.compile().build();
  return encodeMessage(compiled);
}

// Helper to fetch RFC822 headers for a specific Gmail message
export async function getMessageRfcHeaders(params: { accessToken: string; messageId: string }) {
  const gmail = gmailClientFromAccessToken(params.accessToken);
  try {
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: params.messageId,
      format: 'metadata',
      metadataHeaders: ['Message-Id', 'References', 'Reply-To', 'From']
    });
    const headers = (msg.data.payload?.headers || []) as Array<{ name?: string; value?: string }>;
    const messageId = headers.find(h => (h.name || '').toLowerCase() === 'message-id')?.value || '';
    const references = headers.find(h => (h.name || '').toLowerCase() === 'references')?.value || '';
    const replyTo = headers.find(h => (h.name || '').toLowerCase() === 'reply-to')?.value || '';
    const from = headers.find(h => (h.name || '').toLowerCase() === 'from')?.value || '';
    return { messageId, references, replyTo, from };
  } catch {
    return { messageId: '', references: '', replyTo: '', from: '' };
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
  attachments?: Attachment[];
}) {
  const gmail = gmailClientFromAccessToken(params.accessToken);
  const headers: Record<string, string> = { 'X-Fyxer-Case-Id': params.caseId };
  const raw = await createMail({
    to: params.to,
    subject: params.subject,
    alternatives: [
      { contentType: 'text/plain; charset=UTF-8', content: params.textBody },
      { contentType: 'text/html; charset=UTF-8', content: params.htmlBody },
    ],
    attachments: params.attachments,
    headers,
    inReplyTo: params.inReplyTo || '',
    references: (params.references || params.inReplyTo || '')
  });
  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { threadId: params.threadId, raw } }
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
  attachments?: Attachment[];
}) {
  const gmail = gmailClientFromAccessToken(params.accessToken);
  const plain = (params.textBody ?? params.htmlBody)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'See HTML version.';

  const raw = await createMail({
    to: params.to,
    subject: params.subject,
    alternatives: [
      { contentType: 'text/plain; charset=UTF-8', content: plain },
      { contentType: 'text/html; charset=UTF-8', content: params.htmlBody },
    ],
    attachments: params.attachments,
    headers: { ...(params.extraHeaders || {}) }
  });

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: { message: { threadId: params.threadId, raw } }
  });
  return res.data;
}
