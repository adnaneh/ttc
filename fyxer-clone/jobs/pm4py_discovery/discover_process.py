import os
from datetime import datetime, timezone
from typing import Optional
import os

import pandas as pd
from google.cloud import bigquery, storage
from pm4py.objects.log.util import dataframe_utils
from pm4py.algo.discovery.inductive import algorithm as inductive_miner
from pm4py.visualization.bpmn import visualizer as bpmn_visualizer
from pm4py.objects.conversion.wf_net import converter as wf_net_converter
from pm4py.objects.conversion.process_tree import converter as pt_converter
try:
  from pm4py.objects.conversion.process_tree.variants import to_bpmn as pt_to_bpmn  # type: ignore
except Exception:  # pragma: no cover
  pt_to_bpmn = None  # fallback path used
from pm4py.objects.conversion.log import converter as log_converter


DATASET = os.environ.get("BQ_DATASET", "fyxer_dw")
BUCKET = os.environ.get("OUTPUT_BUCKET")  # expected form: gs://bucket-name
OUTPUT_LOCAL_DIR = os.environ.get("OUTPUT_LOCAL_DIR", "").strip()
LOOKBACK_DAYS = int(os.environ.get("LOOKBACK_DAYS", "180"))


def main():
  # Resolve project id from env or ADC
  project = os.environ.get("GCP_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
  if not BUCKET:
    raise RuntimeError("OUTPUT_BUCKET env var is required (e.g., gs://my-bucket)")

  bq = bigquery.Client(project=project) if project else bigquery.Client()
  project_id = project or bq.project

  query = f"""
  SELECT canon_case_id as case_id, activity, ts
  FROM `{project_id}.{DATASET}.v_proc_events_canon`
  WHERE ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {LOOKBACK_DAYS} DAY)
  """

  df = bq.query(query).to_dataframe()
  if df.empty:
    print("No rows returned; skipping discovery.")
    return

  df = df.rename(columns={
    "case_id": "case:concept:name",
    "activity": "concept:name",
    "ts": "time:timestamp",
  })
  df = dataframe_utils.convert_timestamp_columns_in_df(df)
  log = log_converter.apply(df)

  # Discover process tree via Inductive Miner
  tree = inductive_miner.apply(log)
  # Prefer direct ProcessTree -> BPMN if available in this pm4py version
  if pt_to_bpmn is not None:
    bpmn_graph = pt_to_bpmn.apply(tree)
  else:
    # Fallback: tree -> Petri net (WF-net) -> BPMN
    net, im, fm = pt_converter.apply(tree)
    bpmn_graph = wf_net_converter.apply(net, im, fm)

  # Render SVG/PNG (Graphviz Digraph -> bytes)
  gv = bpmn_visualizer.apply(bpmn_graph)
  svg_bytes = gv.pipe(format="svg")
  png_bytes: Optional[bytes] = None
  try:
    png_bytes = gv.pipe(format="png")
  except Exception:
    png_bytes = None

  # Upload to GCS with timestamped name
  gcs = storage.Client(project=project_id)
  bucket_name = BUCKET.replace("gs://", "")
  bucket = gcs.bucket(bucket_name)
  ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
  base = f"process_models/spot_to_invoice_{ts}"
  # Upload SVG
  path_svg = f"{base}.svg"
  blob_svg = bucket.blob(path_svg)
  blob_svg.upload_from_string(svg_bytes, content_type="image/svg+xml")
  print(f"Uploaded: gs://{bucket_name}/{path_svg}")
  # Upload PNG if available
  if png_bytes is not None:
    path_png = f"{base}.png"
    blob_png = bucket.blob(path_png)
    blob_png.upload_from_string(png_bytes, content_type="image/png")
    print(f"Uploaded: gs://{bucket_name}/{path_png}")

  # Optional local write for quick inspection
  if OUTPUT_LOCAL_DIR:
    try:
      os.makedirs(OUTPUT_LOCAL_DIR, exist_ok=True)
      local_svg = os.path.join(OUTPUT_LOCAL_DIR, os.path.basename(path_svg))
      with open(local_svg, 'wb') as f:
        f.write(svg_bytes)
      print(f"Wrote local: {local_svg}")
      if png_bytes is not None:
        local_png = os.path.join(OUTPUT_LOCAL_DIR, os.path.basename(f"{base}.png"))
        with open(local_png, 'wb') as f:
          f.write(png_bytes)
        print(f"Wrote local: {local_png}")
    except Exception as e:
      print(f"WARN: Failed local write to {OUTPUT_LOCAL_DIR}: {e}")


if __name__ == "__main__":
  main()
