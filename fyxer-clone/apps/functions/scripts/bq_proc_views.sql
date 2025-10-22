-- Canonical process-mining views for BigQuery
-- Replace `YOUR_PROJECT` if you run with the bq CLI without a default project set.

-- View 1: Resolve a canonical case id (prefer quote-based cases "Q:*"; else best binding)
CREATE OR REPLACE VIEW `YOUR_PROJECT.fyxer_dw.v_proc_events_canon` AS
WITH e AS (
  SELECT
    case_id,
    event_id,
    activity,
    ts,
    source,
    provider,
    org_id,
    actor,
    thread_id,
    message_id,
    attrs
  FROM `YOUR_PROJECT.fyxer_dw.proc_events`
),
-- try to bind by threadId, invoiceNo, maerskBookingId, sapDocId, poNumber (if present in attrs)
keys AS (
  SELECT
    event_id,
    COALESCE(
      (SELECT ANY_VALUE(case_id) FROM `YOUR_PROJECT.fyxer_dw.case_xref`
       WHERE key_type='threadId' AND key_value=e.thread_id),
      (SELECT ANY_VALUE(case_id) FROM `YOUR_PROJECT.fyxer_dw.case_xref`
       WHERE key_type='invoiceNo' AND key_value=JSON_VALUE(e.attrs, '$.fields.invoiceNo')),
      (SELECT ANY_VALUE(case_id) FROM `YOUR_PROJECT.fyxer_dw.case_xref`
       WHERE key_type='maerskBookingId' AND key_value=JSON_VALUE(e.attrs, '$.booking.id')),
      (SELECT ANY_VALUE(case_id) FROM `YOUR_PROJECT.fyxer_dw.case_xref`
       WHERE key_type='sapDocId' AND key_value=JSON_VALUE(e.attrs, '$.sapDocId')),
      (SELECT ANY_VALUE(case_id) FROM `YOUR_PROJECT.fyxer_dw.case_xref`
       WHERE key_type='poNumber' AND key_value=COALESCE(JSON_VALUE(e.attrs, '$.fields.poNumber'), JSON_VALUE(e.attrs, '$.spec.poNumber')))
    ) AS bound_case
  FROM e
)
SELECT
  -- prefer the quote-origin case (Q:*) if present, otherwise fall back to bound case, else original
  COALESCE(
    IF(STARTS_WITH(e.case_id, 'Q:'), e.case_id, NULL),
    bound_case,
    e.case_id
  ) AS canon_case_id,
  e.*
FROM e
LEFT JOIN keys USING(event_id);

-- View 2: per-case order and inter-event durations
CREATE OR REPLACE VIEW `YOUR_PROJECT.fyxer_dw.v_events_ordered` AS
SELECT
  canon_case_id,
  event_id,
  activity,
  ts,
  source,
  provider,
  org_id,
  actor,
  thread_id,
  message_id,
  attrs,
  ROW_NUMBER() OVER (PARTITION BY canon_case_id ORDER BY ts, event_id) AS ev_idx,
  LAG(ts)   OVER (PARTITION BY canon_case_id ORDER BY ts, event_id) AS prev_ts,
  TIMESTAMP_DIFF(ts, LAG(ts) OVER (PARTITION BY canon_case_id ORDER BY ts, event_id), SECOND) AS sec_from_prev
FROM `YOUR_PROJECT.fyxer_dw.v_proc_events_canon`;

-- View 3: activity → task/phase mapping (edit as needed)
CREATE OR REPLACE VIEW `YOUR_PROJECT.fyxer_dw.v_task_map` AS
SELECT 'quote.request'               AS activity, 'Quote Request'     AS task, 'Quote'        AS phase UNION ALL
SELECT 'quote.drafted',                     'Quote Drafted',               'Quote'        UNION ALL
SELECT 'quote.sent',                        'Quote Sent',                  'Quote'        UNION ALL
SELECT 'booking.created',                   'Booking Created',             'Execution'    UNION ALL
SELECT 'booking.confirmed',                 'Booking Confirmed',           'Execution'    UNION ALL
SELECT 'invoice.received.vendor',           'Vendor Invoice Received',     'AP'           UNION ALL
SELECT 'invoice.parsed',                    'Invoice Parsed',              'AP'           UNION ALL
SELECT 'invoice.incoherence.detected',      'Invoice Incoherence',         'AP'           UNION ALL
SELECT 'invoice.corrections.applied',       'Invoice Corrections Applied', 'AP'           UNION ALL
SELECT 'sap.ap.posted',                     'Invoice Posted in SAP',       'AP';

