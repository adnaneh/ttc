import { onRequest } from 'firebase-functions/v2/https';
import { db } from '../util/firestore';

function assertAdmin(req: any) {
  const tok = req.headers['x-admin-token'] || req.headers['X-Admin-Token'];
  if (!tok || String(tok) !== process.env.ADMIN_DASHBOARD_TOKEN) {
    const e = new Error('Unauthorized') as any;
    e.status = 401;
    throw e;
  }
}

function col() {
  const name = process.env.MOCK_HANA_COLLECTION || 'mock_hana_invoices';
  return db.collection(name);
}

export const adminMockInvoicesList = onRequest(async (req, res) => {
  try {
    assertAdmin(req);
    const {
      vendorId, invoiceNo, currency,
      minAmount, maxAmount,
      limit = '25',
      cursor
    } = (req.query || {}) as Record<string, string>;

    let q: FirebaseFirestore.Query = col();
    if (vendorId) q = q.where('VENDOR_ID', '==', vendorId);
    if (invoiceNo) q = q.where('INVOICE_NO', '==', invoiceNo);
    if (currency) q = q.where('CURRENCY', '==', currency);

    const minA = minAmount ? Number(minAmount) : undefined;
    const maxA = maxAmount ? Number(maxAmount) : undefined;
    if (minA != null && !Number.isNaN(minA)) q = q.where('AMOUNT', '>=', minA);
    if (maxA != null && !Number.isNaN(maxA)) q = q.where('AMOUNT', '<=', maxA);

    q = q.orderBy('UPDATED_AT', 'desc');

    const pageSize = Math.min(Math.max(Number(limit || 25), 1), 100);
    if (cursor) {
      const curDoc = await col().doc(String(cursor)).get();
      if (curDoc.exists) q = q.startAfter(curDoc);
    }
    q = q.limit(pageSize);

    const snap = await q.get();
    const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const nextCursor = snap.docs.length === pageSize ? snap.docs[snap.docs.length - 1].id : null;

    res.json({ items, nextCursor });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message || 'Internal error' });
  }
});

export const adminMockInvoicesGet = onRequest(async (req, res) => {
  try {
    assertAdmin(req);
    const id = (req.query?.id as string) || '';
    if (!id) { res.status(400).json({ error: 'id required' }); return; }
    const doc = await col().doc(id).get();
    if (!doc.exists) { res.status(404).json({ error: 'not found' }); return; }
    res.json({ id: doc.id, ...(doc.data() as any) });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message || 'Internal error' });
  }
});

export const adminMockInvoicesUpdate = onRequest(async (req, res) => {
  try {
    assertAdmin(req);
    if (req.method !== 'POST') { res.status(405).send('POST only'); return; }
    const { id, patch } = (typeof req.body === 'object' ? req.body : JSON.parse(String(req.body || '{}')));
    if (!id || !patch) { res.status(400).json({ error: 'id and patch required' }); return; }

    const allowed = ['AMOUNT', 'CURRENCY', 'DUE_DATE', 'INVOICE_DATE', 'VENDOR_ID', 'VENDOR_NAME', 'PO_NUMBER'];
    const updates: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      const U = k.toUpperCase();
      if (allowed.includes(U)) updates[U] = v;
    }
    updates.UPDATED_AT = Date.now();

    await col().doc(String(id)).update(updates);
    const doc = await col().doc(String(id)).get();
    res.json({ ok: true, item: { id: doc.id, ...(doc.data() as any) } });
  } catch (e: any) {
    res.status(e.status || 500).json({ error: e.message || 'Internal error' });
  }
});
