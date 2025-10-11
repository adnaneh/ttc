import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
export const mailIngest = onMessagePublished('mail.ingest', async (event) => {
  logger.info('mail.ingest', { eventId: event.id });
  // TODO: call ingest pipeline
});

