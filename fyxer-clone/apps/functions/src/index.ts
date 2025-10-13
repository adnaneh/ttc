// Global options MUST be set before any function definitions
import { setGlobalOptions } from 'firebase-functions/v2/options';
setGlobalOptions({
  region: 'europe-west1',
  secrets: [
    'OPENAI_API_KEY',
    'PINECONE_API_KEY',
    'GMAIL_CLIENT_SECRET',
    'MS_CLIENT_SECRET'
  ]
});

// Register path aliases for runtime resolution
import { addAlias } from 'module-alias';
import path from 'path';
import fs from 'fs';
// Load local env files only when not running on Cloud Run (emulator/local build)
// Load base .env first, then override with .env.local if present.
if (!process.env.K_SERVICE) {
  const baseEnv = path.resolve(__dirname, '../.env');
  if (fs.existsSync(baseEnv)) {
    require('dotenv').config({ path: baseEnv });
  }
  const localEnv = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(localEnv)) {
    require('dotenv').config({ path: localEnv });
  }
}

// Support monorepo (repo-root packages/shared/lib) and bundled fallback (lib/_shared)
(() => {
  const candidates = [
    path.resolve(__dirname, '../../../packages/shared/lib'),
    path.resolve(__dirname, './_shared')
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
