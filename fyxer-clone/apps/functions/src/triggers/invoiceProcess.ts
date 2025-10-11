import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { processInvoiceAttachment } from '../pipelines/invoiceProcess';
import { logger } from '../util/logger';

export const invoiceProcess = onMessagePublished(
  { topic: 'invoice.process', memory: '1GiB', timeoutSeconds: 540 },
  async (event) => {
    const payload = event.data?.message?.data
      ? JSON.parse(Buffer.from(event.data.message.data, 'base64').toString())
      : {};
    try {
      const res = await processInvoiceAttachment(payload);
      logger.info('invoice.process done', { ...res, provider: payload.provider, threadId: payload.threadId, messageId: payload.messageId });
    } catch (e: any) {
      logger.error('invoice.process failed', { err: String(e?.message || e) });
    }
  }
);
