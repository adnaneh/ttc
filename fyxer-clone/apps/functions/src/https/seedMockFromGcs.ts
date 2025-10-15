import { onRequest } from 'firebase-functions/v2/https';
import { Storage } from '@google-cloud/storage';
import { db } from '../util/firestore';

export const seedMockFromGcs = onRequest(async (req, res) => {
  const ptr = process.env.MOCK_HANA_SEED_PTR;
  const collection = process.env.MOCK_HANA_COLLECTION || 'mock_hana_invoices';

  if (!ptr || !ptr.startsWith('gs://')) {
    res.status(400).send('Set MOCK_HANA_SEED_PTR to gs://bucket/file.json');
    return;
  }

  try {
    const [, , bucketAndPath] = ptr.split('/');
    const [bucket, ...rest] = bucketAndPath.split('/');
    const object = rest.join('/');

    const storage = new Storage();
    const file = storage.bucket(bucket).file(object);
    const [buf] = await file.download();
    const rows = JSON.parse(buf.toString('utf8')) as any[];

    const batch = db.batch();
    const coll = db.collection(collection);
    rows.forEach((r) => {
      const id = r.ID || r.INVOICE_NO || undefined;
      const ref = id ? coll.doc(String(id)) : coll.doc();
      batch.set(ref, r, { merge: true });
    });
    await batch.commit();

    res.json({ seeded: rows.length, collection });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

