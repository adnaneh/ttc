import type { InvoiceFields } from '../pipelines/invoiceExtract';

export type Incoherence = { field: string; sap: any; email: any; suggested?: any };

export function findIncoherences(email: InvoiceFields, sap: Record<string, any>): Incoherence[] {
  const inc: Incoherence[] = [];
  const tol = process.env.AMOUNT_TOLERANCE ? Number(process.env.AMOUNT_TOLERANCE) : 0.01;

  const checks: Array<[string, any, any, (a: any, b: any) => boolean]> = [
    ['invoiceNo', sap.INVOICE_NO, email.invoiceNo, (a,b) => !!a && !!b && String(a) === String(b)],
    ['vendorId', sap.VENDOR_ID, email.vendorId, (a,b) => !!a && !!b && String(a) === String(b)],
    ['currency', sap.CURRENCY, email.currency, (a,b) => !!a && !!b && String(a) === String(b)],
    ['amount', sap.AMOUNT, email.amount, (a,b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tol],
    ['invoiceDate', sap.INVOICE_DATE?.toISOString?.().slice(0,10) || sap.INVOICE_DATE, email.invoiceDate, (a,b) => !!a && !!b && String(a).slice(0,10) === String(b).slice(0,10)],
    ['dueDate', sap.DUE_DATE?.toISOString?.().slice(0,10) || sap.DUE_DATE, email.dueDate, (a,b) => !!a && !!b && String(a).slice(0,10) === String(b).slice(0,10)],
    ['poNumber', sap.PO_NUMBER, email.poNumber, (a,b) => !!a && !!b && String(a) === String(b)],
  ];

  for (const [field, s, e, ok] of checks) {
    if (e == null) continue;      // unknown from email, skip
    if (s == null) continue;      // unknown in sap, treat as potential, but skip correction unless policy says otherwise
    if (!ok(s, e)) inc.push({ field, sap: s, email: e, suggested: e });
  }
  return inc;
}
