import { BigQuery } from '@google-cloud/bigquery';
import { logger } from './logger';

const bq = new BigQuery();

function dataset() {
  return process.env.BQ_DATASET || 'fyxer_dw';
}
function eventsTable() {
  return process.env.BQ_PROC_EVENTS_TABLE || 'proc_events';
}
function xrefTable() {
  return process.env.BQ_CASE_XREF_TABLE || 'case_xref';
}

export type ProcEvent = {
  case_id: string;
  event_id: string;               // unique; choose stable keys to avoid dupes
  activity: string;               // e.g., 'quote.request'
  ts: number;                     // ms since epoch
  source: string;                 // 'email'|'excel'|'maersk'|'sap'|'system'|'llm'
  provider?: string;              // 'gmail'|'outlook'|'api'|'sap'
  org_id?: string;
  actor?: string;
  thread_id?: string;
  message_id?: string;
  attrs?: Record<string, any>;
  cost?: number;
};

export async function logProcEvent(ev: ProcEvent) {
  const row = {
    case_id: ev.case_id,
    event_id: ev.event_id,
    activity: ev.activity,
    ts: new Date(ev.ts),
    source: ev.source,
    provider: ev.provider ?? null,
    org_id: ev.org_id ?? null,
    actor: ev.actor ?? null,
    thread_id: ev.thread_id ?? null,
    message_id: ev.message_id ?? null,
    // BigQuery JSON typed columns expect a JSON literal (string) via insertAll
    // rather than an object. Use string when attrs provided; else null.
    attrs: ev.attrs ? JSON.stringify(ev.attrs) : null,
    cost: ev.cost ?? null
  };
  const isEmu = !!(process.env.FUNCTIONS_EMULATOR || process.env.FIRESTORE_EMULATOR_HOST || process.env.PUBSUB_EMULATOR_HOST);
  try {
    // Use insertId per row for de-dupe (raw API shape)
    await bq
      .dataset(dataset())
      .table(eventsTable())
      .insert([{ insertId: ev.event_id, json: row }], { raw: true });
  } catch (e: any) {
    const details = Array.isArray(e?.errors) ? e.errors : (e?.response?.insertErrors || e?.errors || []);
    logger.warn('procEvent: BigQuery insert failed', {
      table: `${dataset()}.${eventsTable()}`,
      err: String(e?.message || e),
      details
    });
    // Don’t crash the pipeline locally; allow prod to continue too (best-effort logging)
    if (!isEmu) {
      // Swallow in prod as well to keep business flow resilient; uncomment next line to make it strict.
      // throw e;
    }
  }
}

export async function bindCaseKey(params: {
  case_id: string; key_type: string; key_value: string;
  confidence?: number; source?: string;
}) {
  const row = {
    case_id: params.case_id,
    key_type: params.key_type,
    key_value: params.key_value,
    confidence: params.confidence ?? 1.0,
    source: params.source ?? 'system',
    created_at: new Date()
  };
  const isEmu = !!(process.env.FUNCTIONS_EMULATOR || process.env.FIRESTORE_EMULATOR_HOST || process.env.PUBSUB_EMULATOR_HOST);
  try {
    await bq
      .dataset(dataset())
      .table(xrefTable())
      .insert([{ insertId: `${params.key_type}:${params.key_value}`, json: row }], { raw: true });
  } catch (e: any) {
    const details = Array.isArray(e?.errors) ? e.errors : (e?.response?.insertErrors || e?.errors || []);
    logger.warn('procEvent: BigQuery xref insert failed', {
      table: `${dataset()}.${xrefTable()}`,
      err: String(e?.message || e),
      details
    });
    if (!isEmu) {
      // Swallow to keep flow resilient
      // throw e;
    }
  }
}

export function tempCaseIdForThread(threadId: string) {
  return `T:${threadId}`;
}
