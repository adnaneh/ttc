import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { logger } from '../util/logger';
export const mailEmbed = onMessagePublished('mail.embed', async (event) => {
  logger.info('mail.embed', { eventId: event.id });
});

