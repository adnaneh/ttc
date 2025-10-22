PM4Py BPMN Discovery Job

Quick start

- Build image:
  - `gcloud builds submit --tag gcr.io/$PROJECT_ID/pm4py-discovery fyxer-clone/jobs/pm4py_discovery`
- Run as Cloud Run Job:
  - `gcloud run jobs create pm4py-discovery --image gcr.io/$PROJECT_ID/pm4py-discovery --region=$REGION`
  - Set env: `GCP_PROJECT=$PROJECT_ID`, `BQ_DATASET=fyxer_dw`, `OUTPUT_BUCKET=gs://<bucket>`
  - `gcloud run jobs update pm4py-discovery --set-env-vars GCP_PROJECT=$PROJECT_ID,BQ_DATASET=fyxer_dw,OUTPUT_BUCKET=gs://<bucket> --region=$REGION`
  - Execute: `gcloud run jobs run pm4py-discovery --region=$REGION`

Local run

- Auth: `gcloud auth application-default login`
- Env: `export GCP_PROJECT=<id> OUTPUT_BUCKET=gs://<bucket> BQ_DATASET=fyxer_dw`
- `pip install -r requirements.txt`
- `python discover_process.py`

Output

- SVG and PNG BPMN diagrams uploaded to `gs://<bucket>/process_models/spot_to_invoice_<timestamp>.{svg,png}`
- When running via `run_local.sh`, local copies are written to `jobs/pm4py_discovery/out/` for easy viewing.
