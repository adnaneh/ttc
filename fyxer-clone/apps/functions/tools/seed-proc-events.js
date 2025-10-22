#!/usr/bin/env node
/*
  Seeds a minimal Spot-to-Invoice trace into BigQuery for quick validation.
  Usage: node tools/seed-proc-events.js [CASE_ID]
*/
const { BigQuery } = require('@google-cloud/bigquery');

async function main() {
  const datasetId = process.env.BQ_DATASET || 'fyxer_dw';
  const eventsTable = process.env.BQ_PROC_EVENTS_TABLE || 'proc_events';
  const xrefTable = process.env.BQ_CASE_XREF_TABLE || 'case_xref';
  const caseId = process.argv[2] || `Q:DEMO-${Date.now()}`;

  const bq = new BigQuery();
  const base = Date.now() - 1000 * 60 * 60; // start an hour ago
  const step = 1000 * 60 * 5; // 5 minutes between events

  const rows = [
    { activity: 'quote.request',        ts: new Date(base + step * 0),  source: 'email',  provider: 'gmail',  actor: 'customer@example.com' },
    { activity: 'quote.drafted',        ts: new Date(base + step * 1),  source: 'system', provider: 'gmail' },
    { activity: 'quote.sent',           ts: new Date(base + step * 2),  source: 'email',  provider: 'gmail',  actor: 'ops@example.com' },
    { activity: 'invoice.received.vendor', ts: new Date(base + step * 6),  source: 'email',  provider: 'gmail' },
    { activity: 'invoice.parsed',       ts: new Date(base + step * 7),  source: 'system' },
    { activity: 'sap.ap.posted',        ts: new Date(base + step * 12), source: 'sap',    provider: 'sap' },
  ].map((r, i) => ({
    case_id: caseId,
    event_id: `${r.activity}:${i}:${Date.now()}`,
    activity: r.activity,
    ts: r.ts,
    source: r.source,
    provider: r.provider || null,
    actor: r.actor || null,
    attrs: {},
  }));

  await bq.dataset(datasetId).table(eventsTable).insert(rows);
  // Bind a couple of keys (optional)
  const xrows = [
    { case_id: caseId, key_type: 'quoteId', key_value: caseId.replace(/^Q:/, ''), confidence: 1.0, source: 'system', created_at: new Date() },
  ];
  await bq.dataset(datasetId).table(xrefTable).insert(xrows).catch(() => {});

  console.log(`[seed] Inserted ${rows.length} events for case ${caseId}`);
}

main().catch(err => { console.error(err); process.exit(1); });

