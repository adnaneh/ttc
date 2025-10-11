import { applyInvoiceCorrections } from './hana';
import { db } from './firestore';

export function parseCorrectionsFromText(text: string) {
  // Look for FYXER-CASE-ID line
  const caseId = (text.match(/FYXER-CASE-ID:\s*([A-Za-z0-9\-\_]+)/)?.[1]) || '';
  // Find lines "- field: old -> new"
  const lines = text.split(/\r?\n/).map(s => s.trim());
  const corr: Record<string, any> = {};
  for (const ln of lines) {
    const m = ln.match(/^\-\s*([a-zA-Z0-9_]+)\s*:\s*(.*?)\s*->\s*(.+)$/);
    if (m) {
      const field = m[1];
      let value = m[3].trim();
      if (/^\d+([.,]\d+)?$/.test(value)) value = Number(value.replace(',', '.'));
      corr[field] = value;
    }
  }
  return { caseId, corrections: corr };
}

export async function applyCorrectionsFromCase(caseId: string, corrections: Record<string, any>) {
  const cs = await db.collection('cases').doc(caseId).get();
  if (!cs.exists) throw new Error('case not found');
  const data = cs.data() as any;
  const invoiceNo = data?.invoice?.invoiceNo || data?.sapSnapshot?.INVOICE_NO || undefined;

  const result = await applyInvoiceCorrections({ invoiceNo }, corrections);
  await cs.ref.update({
    status: 'applied',
    appliedAt: Date.now(),
    appliedCorrections: corrections,
    applyResult: result
  });
  return result;
}

