import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
import { getMailboxByEmail, getFreshAccessTokenForMailbox } from '../util/tokenStore';
import { ingestFromGmail } from '../pipelines/ingestGmail';
import { db } from '../util/firestore';

export const gmailPush = onMessagePublished('gmail-watch', async (event) => {
  const raw = event.data?.message?.data ? JSON.parse(Buffer.from(event.data.message.data, 'base64').toString()) : {};
  const emailAddress: string | undefined = raw.emailAddress;
  const historyId: string | undefined = raw.historyId ? String(raw.historyId) : undefined;

  logger.info('Gmail push', { emailAddress, historyId });

  if (!emailAddress || !historyId) return;

  const mailbox = await getMailboxByEmail(emailAddress);
  if (!mailbox) { logger.warn('No mailbox for email', { emailAddress }); return; }

  const token = await getFreshAccessTokenForMailbox(mailbox.ref.path);
  const startCursor = mailbox.data?.sync?.cursor || historyId;

  await ingestFromGmail(token, String(startCursor), mailbox.id);

  // Advance cursor to latest push historyId
  await mailbox.ref.update({ 'sync.cursor': historyId });
});
