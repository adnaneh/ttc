import { } from 'node:process';

type HanaConn = any;
let hanaModule: any | null = null;

async function getHanaModule() {
  if (hanaModule) return hanaModule;
  try {
    // dynamic import so local dev without driver doesn't crash build
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    hanaModule = require('@sap/hana-client');
    return hanaModule;
  } catch (e) {
    throw new Error('SAP HANA client not installed/loaded. Deploy this function where @sap/hana-client binaries are available (Cloud Run or compatible Functions runtime).');
  }
}

export async function withHana<T>(fn: (conn: HanaConn) => Promise<T>): Promise<T> {
  const hana = await getHanaModule();
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
  try {
    return await fn(conn);
  } finally {
    try { conn.disconnect(); } catch { /* ignore */ }
  }
}

export async function fetchInvoiceByIdentifiers(ident: {
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

    // Fallback by PO + vendor
    if (ident.poNumber && ident.vendorId) {
      const sql = `select * from ${VIEW} where PO_NUMBER = ? and VENDOR_ID = ? order by UPDATED_AT desc`;
      const rows = await run(sql, [ident.poNumber, ident.vendorId]);
      if (rows.length) return rows[0];
    }

    // Fallback by vendor + amount ± tolerance + date window ± 7 days
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

export async function applyInvoiceCorrections(where: { invoiceNo?: string; id?: string }, corrections: Record<string, any>) {
  const TABLE = `${process.env.HANA_SCHEMA ? `"${process.env.HANA_SCHEMA}".` : ''}"${process.env.HANA_INVOICES_VIEW || 'INVOICES'}"`;
  const keys = Object.keys(corrections);
  if (keys.length === 0) return { updated: 0 };
  const setSql = keys.map(k => `"${k.toUpperCase()}" = ?`).join(', ');
  const whereSql = where.invoiceNo ? `INVOICE_NO = ?` : `ID = ?`;
  const sql = `update ${TABLE} set ${setSql} where ${whereSql}`;
  const params = keys.map(k => corrections[k]).concat(where.invoiceNo ?? where.id);
  return withHana(async (conn) => {
    return await new Promise<{ updated: number }>((resolve, reject) =>
      conn.exec(sql, params, (err: any, _rows: any) => err ? reject(err) : resolve({ updated: 1 })));
  });
}
