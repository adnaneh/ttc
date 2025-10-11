import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
export const mailNormalize = onMessagePublished('mail.normalize', async (event) => {
  logger.info('mail.normalize', { eventId: event.id });
});

