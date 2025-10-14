#!/usr/bin/env node
/*
  Auto-creates or updates a push subscription on the real Pub/Sub topic
  to point at your locally exposed bridge (ngrok).

  Usage:
    node tools/setup-push.js               # attempts to read ngrok at 127.0.0.1:4040
    node tools/setup-push.js --endpoint https://sub.ngrok.io/PROJECT/REGION/gmailPushBridge
    node tools/setup-push.js --watch       # keep polling ngrok and update subscription if URL changes

  Requirements:
    - gcloud CLI configured for your project (gcloud config set project <id>)
    - Topic and Gmail permissions already configured
    - ngrok running locally on port 5001 (ngrok http 5001), or pass --endpoint explicitly
*/

const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function log(...args) { console.log('[setup-push]', ...args); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function readDotEnvLocal() {
  try {
    const p = path.resolve(__dirname, '../.env.local');
    const txt = fs.readFileSync(p, 'utf8');
    const out = {};
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}

function parseTopic(info) {
  // Accept either full resource (projects/x/topics/y) or simple (gmail-watch)
  if (!info) return null;
  if (info.startsWith('projects/')) {
    const m = info.match(/^projects\/(.+?)\/topics\/(.+)$/);
    if (!m) return null;
    return { project: m[1], topic: m[2] };
  }
  return null;
}

function gcloud(cmd) {
  return execSync(`gcloud ${cmd}`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
}

function getProjectId(envTopicProject) {
  try {
    const p = gcloud('config get-value project').trim();
    if (p) return p;
  } catch {}
  return envTopicProject || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || '';
}

async function getNgrokHttpsUrl() {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: 4040, path: '/api/tunnels', method: 'GET' }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const t = (data.tunnels || []).find(t => t.public_url && t.public_url.startsWith('https://'));
          resolve(t ? t.public_url : null);
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function resolveEndpointArg(projectId) {
  const argIdx = process.argv.findIndex(a => a === '--endpoint');
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return process.argv[argIdx + 1];
  }
  // Try ngrok API
  for (let i = 0; i < 60; i++) {
    const url = await getNgrokHttpsUrl();
    if (url) return `${url}/${projectId}/europe-west1/gmailPushBridge`;
    await sleep(2000);
  }
  return null;
}

function ensureSubscription(projectId, topic, subName, endpoint) {
  try {
    // Try update first
    gcloud(`pubsub subscriptions update ${subName} --push-endpoint="${endpoint}" --project=${projectId}`);
    log(`Updated subscription ${subName} -> ${endpoint}`);
    return;
  } catch {}
  // Create if not exists
  gcloud(`pubsub subscriptions create ${subName} --topic=${topic} --push-endpoint="${endpoint}" --project=${projectId}`);
  log(`Created subscription ${subName} -> ${endpoint}`);
}

async function main() {
  const watch = process.argv.includes('--watch');
  const envs = readDotEnvLocal();
  const parsed = parseTopic(envs.GMAIL_PUBSUB_TOPIC);
  const topic = parsed ? parsed.topic : 'gmail-watch';
  const projectId = getProjectId(parsed ? parsed.project : undefined) || (parsed ? parsed.project : '');
  if (!projectId) {
    log('ERROR: Could not determine project id. Set gcloud project or define GMAIL_PUBSUB_TOPIC in .env.local');
    process.exit(1);
  }
  const fullTopic = `projects/${projectId}/topics/${topic}`;
  const subName = envs.SUB_NAME || process.env.SUB_NAME || 'gmail-to-local';

  if (!watch) {
    const endpoint = await resolveEndpointArg(projectId);
    if (!endpoint) {
      log('ERROR: Could not detect ngrok URL from 127.0.0.1:4040 and no --endpoint provided.');
      process.exit(2);
    }
    ensureSubscription(projectId, fullTopic, subName, endpoint);
    return;
  }

  // watch mode: poll for ngrok changes and keep updating
  let last = '';
  while (true) {
    const endpoint = await resolveEndpointArg(projectId);
    if (endpoint && endpoint !== last) {
      try {
        ensureSubscription(projectId, fullTopic, subName, endpoint);
        last = endpoint;
      } catch (e) {
        log('WARN: Failed to ensure subscription', String(e.message || e));
      }
    }
    await sleep(5000);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
