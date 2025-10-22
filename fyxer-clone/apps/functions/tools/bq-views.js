#!/usr/bin/env node
/*
  Runs the SQL in scripts/bq_proc_views.sql via the bq CLI.
  - Replaces YOUR_PROJECT in the SQL with detected project id.
  - Requires: gcloud + bq CLI installed and configured.
*/
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function getProjectId() {
  // Prefer gcloud config, fallback to env
  try {
    const out = spawnSync('gcloud', ['config', 'get-value', 'project'], { encoding: 'utf8' });
    const v = (out.stdout || '').trim();
    if (v && v !== '(unset)') return v;
  } catch {}
  return process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
}

function main() {
  const project = getProjectId();
  if (!project) {
    console.error('[bq-views] ERROR: No project detected. Run `gcloud config set project <id>` or set GOOGLE_CLOUD_PROJECT.');
    process.exit(2);
  }
  const sqlPath = path.resolve(__dirname, '..', 'scripts', 'bq_proc_views.sql');
  const raw = fs.readFileSync(sqlPath, 'utf8');
  const sql = raw.replace(/YOUR_PROJECT/g, project);

  const res = spawnSync('bq', ['query', '--use_legacy_sql=false'], { input: sql, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
  if (res.status !== 0) {
    console.error('[bq-views] ERROR: bq query failed. Ensure Cloud SDK is installed (`gcloud components install bq`).');
    process.exit(res.status || 1);
  }
  console.log('[bq-views] Done.');
}

main();

