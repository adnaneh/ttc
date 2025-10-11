import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
// Topic: gmail-watch (push from Gmail API to Pub/Sub)
export const gmailPush = onMessagePublished('gmail-watch', async (event) => {
  const data = (event.data as any)?.message?.data
    ? JSON.parse(Buffer.from((event.data as any).message.data, 'base64').toString())
    : {};
  logger.info('Gmail push', data);
  // data: { emailAddress, historyId }
  // TODO: lookup mailbox by emailAddress → load token → ingestFromGmail(...)
});

