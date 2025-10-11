// HTTPS (Gmail & Outlook OAuth + Search)
export { authGmailStart, authGmailCallback } from './https/authGmail';
export { authOutlookStart, authOutlookCallback } from './https/authOutlook';
export { search } from './https/search';

// Webhooks / cron
export { graphWebhook } from './webhooks/graphWebhook';
export { gmailWatchRenew } from './webhooks/gmailWatchRenew';
export { outlookRenew } from './webhooks/outlookRenew';

// Pub/Sub triggers
export { gmailPush } from './triggers/gmailPush';
export { mailIngest } from './triggers/mailIngest';
export { mailNormalize } from './triggers/mailNormalize';
export { mailEmbed } from './triggers/mailEmbed';
export { mailIndex } from './triggers/mailIndex';
export { invoiceProcess } from './triggers/invoiceProcess';
