-- Process mining analytics queries (SQL-only)
-- Replace `YOUR_PROJECT` if you run with the bq CLI without a default project set.

-- A) Full ordered traces for cases that include both a quote request and a vendor invoice
WITH cases AS (
  SELECT canon_case_id
  FROM `YOUR_PROJECT.fyxer_dw.v_proc_events_canon`
  GROUP BY canon_case_id
  HAVING COUNTIF(activity='quote.request')>0
     AND COUNTIF(activity='invoice.received.vendor')>0
)
SELECT
  e.canon_case_id AS case_id,
  e.ev_idx,
  e.activity,
  e.ts,
  e.source,
  e.provider,
  e.actor,
  e.sec_from_prev,
  e.attrs
FROM `YOUR_PROJECT.fyxer_dw.v_events_ordered` e
JOIN cases USING (canon_case_id)
ORDER BY case_id, e.ev_idx;

-- B) Business task spans (start/end/duration) built from events
-- Edit/add spans to fit your process
WITH e AS (
  SELECT * FROM `YOUR_PROJECT.fyxer_dw.v_events_ordered`
),
spans AS (
  SELECT
    canon_case_id AS case_id,
    'Quote Provided' AS task,
    MIN(IF(activity='quote.request', ts, NULL)) AS start_ts,
    MIN(IF(activity='quote.sent',    ts, NULL)) AS end_ts
  FROM e
  GROUP BY case_id
  UNION ALL
  SELECT
    canon_case_id, 'Booking', MIN(IF(activity='booking.created', ts, NULL)), MIN(IF(activity='booking.confirmed', ts, NULL))
  FROM e GROUP BY canon_case_id
  UNION ALL
  SELECT
    canon_case_id, 'Vendor Invoice', MIN(IF(activity='invoice.received.vendor', ts, NULL)), MAX(IF(activity IN ('invoice.corrections.applied','sap.ap.posted'), ts, NULL))
  FROM e GROUP BY canon_case_id
)
SELECT
  case_id, task, start_ts, end_ts,
  TIMESTAMP_DIFF(end_ts, start_ts, HOUR) AS dur_hours
FROM spans
WHERE start_ts IS NOT NULL AND end_ts IS NOT NULL
ORDER BY case_id, start_ts;

-- C) Variant strings (per-case sequence of activities)
WITH traces AS (
  SELECT
    canon_case_id,
    STRING_AGG(activity, ' → ' ORDER BY ts, event_id) AS variant
  FROM `YOUR_PROJECT.fyxer_dw.v_proc_events_canon`
  GROUP BY canon_case_id
)
SELECT variant, COUNT(*) AS cases
FROM traces
GROUP BY variant
ORDER BY cases DESC
LIMIT 20;

-- D) Directly-Follows Graph with frequency and median minutes between activities
WITH ordered AS (
  SELECT
    canon_case_id,
    activity,
    ts,
    LEAD(activity) OVER (PARTITION BY canon_case_id ORDER BY ts, event_id) AS next_act,
    LEAD(ts)       OVER (PARTITION BY canon_case_id ORDER BY ts, event_id) AS next_ts
  FROM `YOUR_PROJECT.fyxer_dw.v_proc_events_canon`
),
edges AS (
  SELECT
    activity AS a_from,
    next_act AS a_to,
    COUNT(*) AS freq,
    APPROX_QUANTILES(TIMESTAMP_DIFF(next_ts, ts, MINUTE), 5)[OFFSET(2)] AS p50_min
  FROM ordered
  WHERE next_act IS NOT NULL
  GROUP BY a_from, a_to
)
SELECT * FROM edges ORDER BY freq DESC;

-- E) Cycle time from quote.request → sap.ap.posted
WITH spans_ct AS (
  SELECT
    canon_case_id,
    MIN(IF(activity='quote.request', ts, NULL)) AS t_start,
    MAX(IF(activity='sap.ap.posted', ts, NULL)) AS t_end
  FROM `YOUR_PROJECT.fyxer_dw.v_proc_events_canon`
  GROUP BY canon_case_id
)
SELECT
  COUNTIF(t_start IS NOT NULL AND t_end IS NOT NULL) AS cases,
  APPROX_QUANTILES(TIMESTAMP_DIFF(t_end,t_start,HOUR), 5)[OFFSET(2)] AS median_hours,
  APPROX_QUANTILES(TIMESTAMP_DIFF(t_end,t_start,HOUR), 5) AS q05_q95
FROM spans_ct;

-- F) Bottlenecks between key steps
WITH t AS (
  SELECT
    canon_case_id,
    MIN(IF(activity='quote.sent', ts, NULL)) AS t_quote_sent,
    MIN(IF(activity='booking.created', ts, NULL)) AS t_booking,
    MIN(IF(activity='invoice.received.vendor', ts, NULL)) AS t_invoice,
    MIN(IF(activity='sap.ap.posted', ts, NULL)) AS t_posted
  FROM `YOUR_PROJECT.fyxer_dw.v_proc_events_canon`
  GROUP BY canon_case_id
)
SELECT
  COUNT(*) AS cases,
  APPROX_QUANTILES(TIMESTAMP_DIFF(t_booking, t_quote_sent, HOUR), 5)[OFFSET(2)] AS quote_to_booking_h_median,
  APPROX_QUANTILES(TIMESTAMP_DIFF(t_invoice, t_booking, HOUR), 5)[OFFSET(2)] AS booking_to_invoice_h_median,
  APPROX_QUANTILES(TIMESTAMP_DIFF(t_posted, t_invoice, HOUR), 5)[OFFSET(2)] AS invoice_to_posted_h_median
FROM t
WHERE t_quote_sent IS NOT NULL AND t_posted IS NOT NULL;

