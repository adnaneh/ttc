#!/usr/bin/env bash
set -euo pipefail

# Resolve project id from gcloud
PROJECT_ID=${GCP_PROJECT:-${GOOGLE_CLOUD_PROJECT:-}}
if [[ -z "${PROJECT_ID}" ]]; then
  if command -v gcloud >/dev/null 2>&1; then
    PROJECT_ID=$(gcloud config get-value project 2>/dev/null | tr -d '\n' || true)
  fi
fi
if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "ERROR: No project id found. Run 'gcloud config set project <id>' or export GCP_PROJECT." >&2
  exit 2
fi

# BQ dataset
if [[ -z "${BQ_DATASET:-}" ]]; then
  if [[ -f ../../apps/functions/.env ]]; then
    BQ_DATASET=$(grep -E '^BQ_DATASET=' ../../apps/functions/.env | head -n1 | cut -d'=' -f2- | tr -d '\r' || true)
  fi
  BQ_DATASET=${BQ_DATASET:-fyxer_dw}
fi

# OUTPUT_BUCKET: prefer explicit, else reuse mail bucket from functions .env
if [[ -z "${OUTPUT_BUCKET:-}" ]]; then
  if [[ -f ../../apps/functions/.env ]]; then
    MAIL_BUCKET=$(grep -E '^GCS_BUCKET_MAIL=' ../../apps/functions/.env | head -n1 | cut -d'=' -f2- | tr -d '\r' || true)
    if [[ -n "${MAIL_BUCKET}" ]]; then
      OUTPUT_BUCKET="gs://${MAIL_BUCKET}"
    fi
  fi
fi

if [[ -z "${OUTPUT_BUCKET:-}" ]]; then
  echo "ERROR: OUTPUT_BUCKET not set and no GCS_BUCKET_MAIL found in apps/functions/.env" >&2
  echo "       Export OUTPUT_BUCKET=gs://<bucket> and re-run." >&2
  exit 2
fi

export GCP_PROJECT="${PROJECT_ID}"
export GOOGLE_CLOUD_PROJECT="${PROJECT_ID}"
export BQ_DATASET
export OUTPUT_BUCKET
export OUTPUT_LOCAL_DIR="${OUTPUT_LOCAL_DIR:-./out}"

echo "Using: PROJECT=${PROJECT_ID}  BQ_DATASET=${BQ_DATASET}  OUTPUT_BUCKET=${OUTPUT_BUCKET}  OUTPUT_LOCAL_DIR=${OUTPUT_LOCAL_DIR}"

python discover_process.py "$@"
