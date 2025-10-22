import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
import { getMailboxByEmail, getFreshAccessTokenForMailbox } from '../util/tokenStore';
import { ingestFromGmail } from '../pipelines/ingestGmail';

export const gmailPush = onMessagePublished({ topic: 'gmail-watch', memory: '512MiB', timeoutSeconds: 300 }, async (event) => {
  const raw = event.data?.message?.data ? JSON.parse(Buffer.from(event.data.message.data, 'base64').toString()) : {};
  const emailAddress: string | undefined = raw.emailAddress;
  const historyId: string | undefined = raw.historyId ? String(raw.historyId) : undefined;

  logger.info('Gmail push', { emailAddress, historyId });
  // Allow disabling external Gmail calls in local/dev to reduce log noise.
  const gmailDisabled = String(process.env.GMAIL_DISABLE || '').toLowerCase();
  const skipGmail = gmailDisabled === '1' || gmailDisabled === 'true' || gmailDisabled === 'yes';
  if (skipGmail) return;
  if (!emailAddress || !historyId) return;

  const mailbox = await getMailboxByEmail(emailAddress);
  if (!mailbox) { logger.warn('No mailbox for email', { emailAddress }); return; }

  const token = await getFreshAccessTokenForMailbox(mailbox.ref.path);
  const startCursor = mailbox.data?.sync?.cursor || historyId;

  // Ingest history since last cursor (handles inbound and SENT once)
  await ingestFromGmail(token, String(startCursor), mailbox.id);
  await mailbox.ref.update({ 'sync.cursor': historyId });
});
