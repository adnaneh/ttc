#!/usr/bin/env node
/*
  Creates the BigQuery dataset and tables used for process mining.
  - Uses env vars: BQ_DATASET, BQ_PROC_EVENTS_TABLE, BQ_CASE_XREF_TABLE
  - Infers projectId from Google ADC (gcloud auth application-default login) or env GOOGLE_CLOUD_PROJECT.
  - Safe to run multiple times (idempotent).
*/
const { BigQuery } = require('@google-cloud/bigquery');

async function main() {
  const datasetId = process.env.BQ_DATASET || 'fyxer_dw';
  const eventsTableId = process.env.BQ_PROC_EVENTS_TABLE || 'proc_events';
  const xrefTableId = process.env.BQ_CASE_XREF_TABLE || 'case_xref';

  const bq = new BigQuery();
  const [projectId] = await bq.getProjectId ? [await bq.getProjectId()] : [process.env.GOOGLE_CLOUD_PROJECT || ''];

  console.log(`[bq-setup] Project: ${projectId || '(unknown)'}  Dataset: ${datasetId}`);

  // Ensure dataset
  const [datasets] = await bq.getDatasets();
  const exists = datasets.some(d => d.id === datasetId);
  if (!exists) {
    await bq.createDataset(datasetId, { location: 'EU' }).catch(() => {});
    console.log(`[bq-setup] Created dataset ${datasetId}`);
  } else {
    console.log(`[bq-setup] Dataset ${datasetId} exists`);
  }

  // Event table
  const eventsSchema = [
    { name: 'case_id', type: 'STRING' },
    { name: 'event_id', type: 'STRING' },
    { name: 'activity', type: 'STRING' },
    { name: 'ts', type: 'TIMESTAMP' },
    { name: 'source', type: 'STRING' },
    { name: 'provider', type: 'STRING' },
    { name: 'org_id', type: 'STRING' },
    { name: 'actor', type: 'STRING' },
    { name: 'thread_id', type: 'STRING' },
    { name: 'message_id', type: 'STRING' },
    { name: 'attrs', type: 'JSON' },
    { name: 'cost', type: 'NUMERIC' }
  ];

  const [eventTableExists] = await bq.dataset(datasetId).table(eventsTableId).exists().catch(() => [false]);
  if (!eventTableExists) {
    await bq.dataset(datasetId).createTable(eventsTableId, {
      schema: eventsSchema,
      timePartitioning: { type: 'DAY', field: 'ts' },
      clustering: { fields: ['case_id', 'activity'] }
    });
    console.log(`[bq-setup] Created table ${datasetId}.${eventsTableId}`);
  } else {
    console.log(`[bq-setup] Table ${datasetId}.${eventsTableId} exists`);
  }

  // Xref table
  const xrefSchema = [
    { name: 'case_id', type: 'STRING' },
    { name: 'key_type', type: 'STRING' },
    { name: 'key_value', type: 'STRING' },
    { name: 'confidence', type: 'FLOAT' },
    { name: 'source', type: 'STRING' },
    { name: 'created_at', type: 'TIMESTAMP' }
  ];

  const [xrefTableExists] = await bq.dataset(datasetId).table(xrefTableId).exists().catch(() => [false]);
  if (!xrefTableExists) {
    await bq.dataset(datasetId).createTable(xrefTableId, {
      schema: xrefSchema,
      timePartitioning: { type: 'DAY', field: 'created_at' },
      clustering: { fields: ['key_type', 'key_value'] }
    });
    console.log(`[bq-setup] Created table ${datasetId}.${xrefTableId}`);
  } else {
    console.log(`[bq-setup] Table ${datasetId}.${xrefTableId} exists`);
  }

  console.log('[bq-setup] Done.');
}

main().catch(err => {
  console.error('[bq-setup] ERROR', err && err.message ? err.message : err);
  process.exit(1);
});

