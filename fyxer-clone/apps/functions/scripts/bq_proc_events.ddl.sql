-- BigQuery Process Mining DDL
-- Replace `YOUR_PROJECT` if you run with the bq CLI without a default project set.

-- Dataset (schema)
CREATE SCHEMA IF NOT EXISTS `YOUR_PROJECT.fyxer_dw`;

-- Event log table
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.fyxer_dw.proc_events` (
  case_id STRING,
  event_id STRING,
  activity STRING,
  ts TIMESTAMP,
  source STRING,
  provider STRING,
  org_id STRING,
  actor STRING,
  thread_id STRING,
  message_id STRING,
  attrs JSON,
  cost NUMERIC
)
PARTITION BY DATE(ts)
CLUSTER BY case_id, activity;

-- Case cross-reference table
CREATE TABLE IF NOT EXISTS `YOUR_PROJECT.fyxer_dw.case_xref` (
  case_id STRING,
  key_type STRING,
  key_value STRING,
  confidence FLOAT64,
  source STRING,
  created_at TIMESTAMP
)
PARTITION BY DATE(created_at)
CLUSTER BY key_type, key_value;

