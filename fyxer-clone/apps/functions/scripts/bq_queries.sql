-- Helpful queries for process mining

-- 1) Cases that have both a quote request and a vendor invoice
WITH e AS (
  SELECT * FROM `YOUR_PROJECT.fyxer_dw.proc_events`
  WHERE ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 180 DAY)
)
SELECT case_id
FROM e
GROUP BY case_id
HAVING COUNTIF(activity = 'quote.request') > 0
   AND COUNTIF(activity = 'invoice.received.vendor') > 0;

-- 2) Full ordered trace for those cases
WITH e AS (
  SELECT * FROM `YOUR_PROJECT.fyxer_dw.proc_events`
),
cases AS (
  SELECT case_id
  FROM e
  GROUP BY case_id
  HAVING COUNTIF(activity = 'quote.request') > 0
     AND COUNTIF(activity = 'invoice.received.vendor') > 0
)
SELECT e.case_id, e.activity, e.ts, e.source, e.provider, e.actor, e.attrs
FROM e
JOIN cases USING (case_id)
ORDER BY case_id, ts;

-- 3) Directly-Follows Graph (DFG) with frequency and median duration
WITH ordered AS (
  SELECT
    case_id,
    activity,
    ts,
    LEAD(activity) OVER (PARTITION BY case_id ORDER BY ts) AS next_act,
    LEAD(ts)       OVER (PARTITION BY case_id ORDER BY ts) AS next_ts
  FROM `YOUR_PROJECT.fyxer_dw.proc_events`
),
edges AS (
  SELECT
    activity AS a_from,
    next_act AS a_to,
    COUNT(*) AS freq,
    APPROX_QUANTILES(TIMESTAMP_DIFF(next_ts, ts, SECOND), 5)[OFFSET(2)] AS p50_sec
  FROM ordered
  WHERE next_act IS NOT NULL
  GROUP BY a_from, a_to
)
SELECT * FROM edges ORDER BY freq DESC;

-- 4) Cycle-time from quote.request -> sap.ap.posted
WITH spans AS (
  SELECT
    case_id,
    MIN(IF(activity='quote.request', ts, NULL)) AS t_start,
    MAX(IF(activity='sap.ap.posted', ts, NULL)) AS t_end
  FROM `YOUR_PROJECT.fyxer_dw.proc_events`
  GROUP BY case_id
)
SELECT
  COUNTIF(t_start IS NOT NULL AND t_end IS NOT NULL) AS cases,
  APPROX_QUANTILES(TIMESTAMP_DIFF(t_end, t_start, HOUR), 5)[OFFSET(2)] AS median_hours
FROM spans;

