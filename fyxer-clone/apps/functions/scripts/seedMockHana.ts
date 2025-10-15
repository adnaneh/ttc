/* ts-node apps/functions/scripts/seedMockHana.ts */
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

const COLLECTION = process.env.MOCK_HANA_COLLECTION || 'mock_hana_invoices';
const FILE = process.env.SEED_FILE || path.resolve(__dirname, '../src/mock/seed.mock.json');

async function main() {
  if (!admin.apps.length) admin.initializeApp();
  const db = admin.firestore();

  const raw = JSON.parse(fs.readFileSync(FILE, 'utf8')) as any[];
  const batch = db.batch();
  for (const row of raw) {
    const id = row.ID || row.INVOICE_NO || undefined;
    const ref = id ? db.collection(COLLECTION).doc(String(id)) : db.collection(COLLECTION).doc();
    batch.set(ref, row, { merge: true });
  }
  await batch.commit();
  console.log(`Seeded ${raw.length} docs into ${COLLECTION}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

