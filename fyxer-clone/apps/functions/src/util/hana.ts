import { db } from './firestore';
import * as hana from '@sap/hana-client';

// ----------------------- Real HANA implementation -----------------------
type HanaConn = any;

async function withHana<T>(fn: (conn: HanaConn) => Promise<T>): Promise<T> {
  const conn = hana.createConnection();
  const params: Record<string, any> = {
    serverNode: `${process.env.HANA_HOST}:${process.env.HANA_PORT}`,
    uid: process.env.HANA_USER,
    pwd: process.env.HANA_PASSWORD
  };
  if (String(process.env.HANA_SSL).toLowerCase() === 'true') {
    params.encrypt = 'true';
    params.sslValidateCertificate = String(process.env.HANA_SSL_VALIDATE).toLowerCase() === 'true';
  }
  await new Promise<void>((resolve, reject) => conn.connect(params, (err: any) => err ? reject(err) : resolve()));
  try { return await fn(conn); } finally { try { conn.disconnect(); } catch {} }
}

async function hanaFetch(ident: {
  invoiceNo?: string;
  vendorId?: string;
  currency?: string;
  amount?: number;
  invoiceDate?: string; // ISO yyyy-mm-dd
  poNumber?: string;
}) {
  const VIEW = `${process.env.HANA_SCHEMA ? `"${process.env.HANA_SCHEMA}".` : ''}"${process.env.HANA_INVOICES_VIEW || 'INVOICES'}"`;
  return withHana(async (conn) => {
    const run = (sql: string, params: any[]) =>
      new Promise<any[]>((resolve, reject) => conn.exec(sql, params, (err: any, rows: any[]) => err ? reject(err) : resolve(rows)));

    if (ident.invoiceNo) {
      const sql = `select * from ${VIEW} where INVOICE_NO = ? order by UPDATED_AT desc`;
      const rows = await run(sql, [ident.invoiceNo]);
      if (rows.length) return rows[0];
    }

    if (ident.poNumber && ident.vendorId) {
      const sql = `select * from ${VIEW} where PO_NUMBER = ? and VENDOR_ID = ? order by UPDATED_AT desc`;
      const rows = await run(sql, [ident.poNumber, ident.vendorId]);
      if (rows.length) return rows[0];
    }

    if (ident.vendorId && (ident.amount ?? 0) > 0) {
      const tol = process.env.AMOUNT_TOLERANCE ? Number(process.env.AMOUNT_TOLERANCE) : 0.01;
      const minAmt = (ident.amount! - tol);
      const maxAmt = (ident.amount! + tol);
      const date = ident.invoiceDate || null;
      const sql = `
        select * from ${VIEW}
         where VENDOR_ID = ?
           and AMOUNT between ? and ?
           ${ident.currency ? 'and CURRENCY = ?' : ''}
           ${date ? 'and INVOICE_DATE between add_days(to_date(?, \'YYYY-MM-DD\'), -7) and add_days(to_date(?, \'YYYY-MM-DD\'), 7)' : ''}
         order by UPDATED_AT desc`;
      const params: any[] = [ident.vendorId as any, minAmt, maxAmt];
      if (ident.currency) params.push(ident.currency);
      if (date) params.push(ident.invoiceDate, ident.invoiceDate);
      const rows = await run(sql, params);
      if (rows.length) return rows[0];
    }
    return null;
  });
}

async function hanaUpdate(where: { invoiceNo?: string; id?: string }, corrections: Record<string, any>) {
  const TABLE = `${process.env.HANA_SCHEMA ? `"${process.env.HANA_SCHEMA}".` : ''}"${process.env.HANA_INVOICES_VIEW || 'INVOICES'}"`;
  const keys = Object.keys(corrections);
  if (keys.length === 0) return { updated: 0 };
  const setSql = keys.map(k => `"${k.toUpperCase()}" = ?`).join(', ');
  const whereSql = where.invoiceNo ? `INVOICE_NO = ?` : `ID = ?`;
  const sql = `update ${TABLE} set ${setSql} where ${whereSql}`;
  const params = keys.map(k => corrections[k]).concat(where.invoiceNo ?? where.id);
  return withHana(async (conn) => {
    return await new Promise<{ updated: number }>((resolve, reject) =>
      conn.exec(sql, params, (err: any) => err ? reject(err) : resolve({ updated: 1 })));
  });
}

// ----------------------- Firestore mock implementation -----------------------
function collName() {
  return process.env.MOCK_HANA_COLLECTION || 'mock_hana_invoices';
}
function col() {
  return db.collection(collName());
}

// Ensure returned row uses HANA-like column names (UPPERCASE)
function normalizeRow(doc: FirebaseFirestore.DocumentSnapshot, data: any) {
  const up: any = {};
  for (const [k, v] of Object.entries(data)) up[k.toString().toUpperCase()] = v;
  up.ID = up.ID || doc.id;
  return up;
}

async function mockFetch(ident: {
  invoiceNo?: string;
  vendorId?: string;
  currency?: string;
  amount?: number;
  invoiceDate?: string;
  poNumber?: string;
}) {
  if (ident.invoiceNo) {
    const q = await col().where('INVOICE_NO', '==', ident.invoiceNo).orderBy('UPDATED_AT', 'desc').limit(1).get();
    if (!q.empty) return normalizeRow(q.docs[0], q.docs[0].data());
  }

  if (ident.poNumber && ident.vendorId) {
    const q = await col()
      .where('PO_NUMBER', '==', ident.poNumber)
      .where('VENDOR_ID', '==', ident.vendorId)
      .orderBy('UPDATED_AT', 'desc').limit(1).get();
    if (!q.empty) return normalizeRow(q.docs[0], q.docs[0].data());
  }

  if (ident.vendorId && (ident.amount ?? 0) > 0) {
    const tol = process.env.AMOUNT_TOLERANCE ? Number(process.env.AMOUNT_TOLERANCE) : 0.01;
    const minAmt = ident.amount! - tol;
    const maxAmt = ident.amount! + tol;

    let q: FirebaseFirestore.Query = col()
      .where('VENDOR_ID', '==', ident.vendorId)
      .where('AMOUNT', '>=', minAmt)
      .where('AMOUNT', '<=', maxAmt);

    if (ident.currency) q = q.where('CURRENCY', '==', ident.currency);

    q = q.orderBy('AMOUNT', 'asc').orderBy('UPDATED_AT', 'desc').limit(50);

    const snap = await q.get();
    const rows = snap.docs.map(d => normalizeRow(d, d.data()));

    if (ident.invoiceDate) {
      const target = Date.parse(ident.invoiceDate);
      const hit = rows.find(r => {
        const d = Date.parse((r.INVOICE_DATE?.toISOString?.() || r.INVOICE_DATE) as string);
        return Math.abs(d - target) <= 7 * 86400000;
      });
      if (hit) return hit;
    }
    if (rows.length) return rows[0];
  }

  return null;
}

async function mockUpdate(where: { invoiceNo?: string; id?: string }, corrections: Record<string, any>) {
  let docRef: FirebaseFirestore.DocumentReference | null = null;

  if (where.id) docRef = col().doc(where.id);
  if (!docRef && where.invoiceNo) {
    const q = await col().where('INVOICE_NO', '==', where.invoiceNo).limit(1).get();
    if (!q.empty) docRef = q.docs[0].ref;
  }
  if (!docRef) throw new Error('Mock invoice not found');

  const updates: Record<string, any> = {};
  for (const [k, v] of Object.entries(corrections)) updates[k.toUpperCase()] = v;
  updates.UPDATED_AT = Date.now();

  await docRef.update(updates);
  return { updated: 1, id: docRef.id };
}

// ----------------------- Public API (router) -----------------------
export async function fetchInvoiceByIdentifiers(ident: {
  invoiceNo?: string;
  vendorId?: string;
  currency?: string;
  amount?: number;
  invoiceDate?: string;
  poNumber?: string;
}) {
  return String(process.env.DB_BACKEND || 'hana') === 'mock' ? mockFetch(ident) : hanaFetch(ident);
}

export async function applyInvoiceCorrections(where: { invoiceNo?: string; id?: string }, corrections: Record<string, any>) {
  return String(process.env.DB_BACKEND || 'hana') === 'mock' ? mockUpdate(where, corrections) : hanaUpdate(where, corrections);
}
