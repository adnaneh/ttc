import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
export const mailIndex = onMessagePublished('mail.index', async (event) => {
  logger.info('mail.index', { eventId: event.id });
});

