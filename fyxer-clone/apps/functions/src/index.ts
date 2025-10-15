// Global options MUST be set before any function definitions
import { setGlobalOptions } from 'firebase-functions/v2/options';
import { defineSecret } from 'firebase-functions/params';

// Define shared secrets once and mount them on all functions
const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const PINECONE_API_KEY = defineSecret('PINECONE_API_KEY');
const GMAIL_CLIENT_SECRET = defineSecret('GMAIL_CLIENT_SECRET');
const MS_CLIENT_SECRET = defineSecret('MS_CLIENT_SECRET');
const ADMIN_DASHBOARD_TOKEN = defineSecret('ADMIN_DASHBOARD_TOKEN');

setGlobalOptions({
  region: 'europe-west1',
  secrets: [OPENAI_API_KEY, PINECONE_API_KEY, GMAIL_CLIENT_SECRET, MS_CLIENT_SECRET, ADMIN_DASHBOARD_TOKEN]
});

// Register path aliases for runtime resolution
import { addAlias } from 'module-alias';
import path from 'path';
import fs from 'fs';

// Support bundled local copy first (lib/_shared) for emulator hot reload,
// then fall back to monorepo path (repo-root packages/shared/lib)
(() => {
  const candidates = [
    path.resolve(__dirname, './_shared'),
    path.resolve(__dirname, '../../../packages/shared/lib')
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) { addAlias('@shared', p); return; }
  }
})();
// HTTPS (Gmail & Outlook OAuth + Search)
export { testInvoice } from './https/testInvoice';
export { authGmailStart, authGmailCallback } from './https/authGmail';
export { authOutlookStart, authOutlookCallback } from './https/authOutlook';
export { search } from './https/search';
export { gmailPushBridge } from './https/gmailPushBridge';
export { rewatchGmail } from './https/rewatchGmail';
export { seedMockFromGcs } from './https/seedMockFromGcs';
export { adminMockInvoicesList, adminMockInvoicesGet, adminMockInvoicesUpdate } from './https/mockInvoices';

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
