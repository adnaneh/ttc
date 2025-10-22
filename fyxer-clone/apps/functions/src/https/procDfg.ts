import { onRequest } from 'firebase-functions/v2/https';
import { BigQuery } from '@google-cloud/bigquery';

function intFromQuery(q: any, key: string, defVal: number, min?: number, max?: number) {
  const raw = (q?.[key] as string) ?? '';
  const n = Number.parseInt(String(raw || defVal), 10);
  if (Number.isNaN(n)) return defVal;
  const lo = min != null ? Math.max(n, min) : n;
  return max != null ? Math.min(lo, max) : lo;
}

export const procDfg = onRequest(async (req, res) => {
  try {
    // Basic CORS for browser clients
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type');
      res.status(204).send('');
      return;
    }

    const sinceDays = intFromQuery(req.query, 'sinceDays', 180, 1, 3650);
    const minFreq = intFromQuery(req.query, 'minFreq', 1, 1);
    const limit = intFromQuery(req.query, 'limit', 200, 1, 2000);
    const requireQI = String(req.query?.requireQuoteAndInvoice || req.query?.qi || '') === '1';

    const dataset = process.env.BQ_DATASET || 'fyxer_dw';
    const bq = new BigQuery();
    const projectId = (bq as any).getProjectId ? await (bq as any).getProjectId() : (process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT);
    const view = `\`${projectId}.${dataset}.v_proc_events_canon\``;

    const sql = `
      WITH base AS (
        SELECT canon_case_id, activity, ts, event_id
        FROM ${view}
        WHERE ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @sinceDays DAY)
      )
      ${requireQI ? `, cases AS (
        SELECT canon_case_id
        FROM base
        GROUP BY canon_case_id
        HAVING COUNTIF(activity = 'quote.request') > 0 AND COUNTIF(activity = 'invoice.received.vendor') > 0
      )` : ''}
      , ordered AS (
        SELECT
          b.canon_case_id,
          b.activity,
          b.ts,
          LEAD(b.activity) OVER (PARTITION BY b.canon_case_id ORDER BY b.ts, b.event_id) AS next_act,
          LEAD(b.ts)       OVER (PARTITION BY b.canon_case_id ORDER BY b.ts, b.event_id) AS next_ts
        FROM base b
        ${requireQI ? 'JOIN cases USING (canon_case_id)' : ''}
      )
      , edges AS (
        SELECT
          activity AS a_from,
          next_act AS a_to,
          COUNT(*) AS freq,
          APPROX_QUANTILES(TIMESTAMP_DIFF(next_ts, ts, MINUTE), 5)[OFFSET(2)] AS p50_min
        FROM ordered
        WHERE next_act IS NOT NULL
        GROUP BY a_from, a_to
      )
      SELECT a_from, a_to, freq, p50_min
      FROM edges
      WHERE freq >= @minFreq
      ORDER BY freq DESC
      LIMIT ${limit}
    `;

    const [rows] = await bq.query({
      query: sql,
      params: { sinceDays, minFreq },
      location: 'EU'
    });

    res.json({
      meta: { sinceDays, minFreq, limit, filtered: requireQI, generatedAt: new Date().toISOString() },
      edges: rows.map((r: any) => ({ from: r.a_from, to: r.a_to, freq: Number(r.freq), p50_min: Number(r.p50_min) }))
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Internal error' });
  }
});

