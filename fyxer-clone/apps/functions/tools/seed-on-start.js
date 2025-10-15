#!/usr/bin/env node
/**
 * Seeds the mock SAP invoices collection on emulator or real Firestore.
 * - By default targets emulator if FIRESTORE_EMULATOR_HOST is set (we load .env/.env.local).
 * - Reads JSON from SEED_FILE or src/mock/seed.mock.json
 * - Uses collection name MOCK_HANA_COLLECTION or 'mock_hana_invoices'
 * - Idempotent (merge writes)
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function log(...args) { console.log('[seed]', ...args); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function loadDotEnv(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {}
}

function loadProjectIdFallback() {
  try {
    const firebaserc = path.resolve(__dirname, '../../.firebaserc');
    const obj = JSON.parse(fs.readFileSync(firebaserc, 'utf8'));
    const def = obj?.projects?.default;
    if (def && !process.env.GOOGLE_CLOUD_PROJECT) process.env.GOOGLE_CLOUD_PROJECT = def;
  } catch {}
}

async function ensureAdmin() {
  if (admin.apps.length) return;
  try { admin.initializeApp(); } catch {}
}

async function waitForFirestore(maxMs = 20000) {
  const start = Date.now();
  while (true) {
    try {
      await admin.firestore().listCollections();
      return;
    } catch (e) {
      if (Date.now() - start > maxMs) throw e;
      await sleep(500);
    }
  }
}

async function seed() {
  if (String(process.env.DISABLE_AUTO_SEED || '').toLowerCase() === '1' || String(process.env.DISABLE_AUTO_SEED || '').toLowerCase() === 'true') {
    log('Auto seed disabled via DISABLE_AUTO_SEED');
    return;
  }
  // Load envs for emulator
  const fnDir = path.resolve(__dirname, '..');
  loadDotEnv(path.resolve(fnDir, '.env'));
  loadDotEnv(path.resolve(fnDir, '.env.local'));
  loadProjectIdFallback();

  const FILE = process.env.SEED_FILE || path.resolve(fnDir, 'src/mock/seed.mock.json');
  const COLLECTION = process.env.MOCK_HANA_COLLECTION || 'mock_hana_invoices';

  if (!fs.existsSync(FILE)) {
    log('Seed file not found', FILE);
    process.exit(0);
  }

  await ensureAdmin();
  await waitForFirestore().catch(() => {});

  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!Array.isArray(data)) { log('Seed file format invalid (expected array)'); process.exit(1); }

  const db = admin.firestore();
  let batch = db.batch();
  let pending = 0;
  let total = 0;
  for (const row of data) {
    const id = row.ID || row.INVOICE_NO || undefined;
    const ref = id ? db.collection(COLLECTION).doc(String(id)) : db.collection(COLLECTION).doc();
    batch.set(ref, row, { merge: true });
    pending++;
    total++;
    if (pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending > 0) await batch.commit();
  log(`Seeded ${total} docs into ${COLLECTION}`);
}

seed().catch((e) => { console.error(e); process.exit(1); });
