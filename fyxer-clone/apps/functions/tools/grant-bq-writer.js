#!/usr/bin/env node
/*
  Grants dataset-level WRITER access (legacy ACL) to a service account.
  This is sufficient for streaming inserts when IAM dataset policy commands are unavailable.

  Usage:
    node tools/grant-bq-writer.js <service-account-email> [DATASET]

  Defaults:
    DATASET = process.env.BQ_DATASET || 'fyxer_dw'
*/
const { BigQuery } = require('@google-cloud/bigquery');

async function main() {
  const saEmail = process.argv[2];
  if (!saEmail) {
    console.error('Usage: node tools/grant-bq-writer.js <service-account-email> [DATASET]');
    process.exit(2);
  }
  const datasetId = process.argv[3] || process.env.BQ_DATASET || 'fyxer_dw';

  const bq = new BigQuery();
  const ds = bq.dataset(datasetId);
  const [meta] = await ds.getMetadata();
  const access = Array.isArray(meta.access) ? meta.access.slice() : [];

  const exists = access.some(a => a.role === 'WRITER' && (a.userByEmail === saEmail || a.iamMember === `serviceAccount:${saEmail}`));
  if (exists) {
    console.log(`[grant-bq-writer] Already has WRITER access: ${saEmail} on ${datasetId}`);
    return;
  }
  access.push({ role: 'WRITER', userByEmail: saEmail });

  await ds.setMetadata({ access });
  console.log(`[grant-bq-writer] Granted WRITER on ${datasetId} to ${saEmail}`);
}

main().catch(err => { console.error('[grant-bq-writer] ERROR', err && err.message ? err.message : err); process.exit(1); });

