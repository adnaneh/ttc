import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from '../util/logger';

// Runs periodically to renew Gmail watch per mailbox
export const gmailWatchRenew = onSchedule('every 60 minutes', async () => {
  logger.info('Renew Gmail watch cron tick');
  // TODO: fetch mailboxes with impending expiration, call users.watch again
});

