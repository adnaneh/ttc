import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
import { embedMessage } from '../pipelines/embed';

export const mailEmbed = onMessagePublished('mail.embed', async (event) => {
  const msg = event.data?.message?.data ? JSON.parse(Buffer.from(event.data.message.data, 'base64').toString()) : {};
  const { mailboxId, messageId } = msg;
  if (!mailboxId || !messageId) return logger.warn('mail.embed missing fields', msg);
  await embedMessage(mailboxId, messageId);
  logger.info('Embedded', { mailboxId, messageId });
});
