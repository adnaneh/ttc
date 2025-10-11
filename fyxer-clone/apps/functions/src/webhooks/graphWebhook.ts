import { onRequest } from 'firebase-functions/v2/https';
import { logger } from '../util/logger';

export const graphWebhook = onRequest(async (req, res) => {
  const token = req.query.validationToken as string | undefined;
  if (token) {
    logger.info('Graph validation handshake');
    return res.status(200).send(token);
  }
  const body = req.body as { value: Array<{ resource: string; subscriptionId: string }>};
  logger.info('Graph notifications', body);
  // TODO: enqueue to Pub/Sub for processing
  return res.status(202).end();
});

