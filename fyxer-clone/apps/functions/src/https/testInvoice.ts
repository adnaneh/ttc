import { onRequest } from 'firebase-functions/v2/https';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Busboy = require('busboy');
import { extractInvoiceFieldsFromPdf, type InvoiceFields } from '../pipelines/invoiceExtract';
import { extractInvoiceFieldsFromImage } from '../pipelines/invoiceExtract';
import { fetchInvoiceByIdentifiers } from '../util/hana';
import { findIncoherences } from '../util/invoiceCompare';
import { env } from '../env';

function cors(res: any) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'content-type');
  res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
}

function parseMultipart(req: any): Promise<{ filename: string; buffer: Buffer; mimetype: string }> {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers });
    const fileBufs: Buffer[] = [];
    let filename = 'invoice.pdf';
    let mimetype = 'application/pdf';
    let gotFile = false;

    bb.on('file', (_name: string, file: any, info: { filename: string; mimeType: string }) => {
      gotFile = true;
      filename = info.filename || filename;
      mimetype = info.mimeType || mimetype;
      file.on('data', (d: Buffer) => fileBufs.push(d));
      file.on('limit', () => reject(new Error('File too large')));
      file.on('end', () => {});
    });

    bb.on('error', (err: any) => reject(err));
    bb.on('finish', () => {
      if (!gotFile) return reject(new Error('No file field in form-data'));
      resolve({ filename, buffer: Buffer.concat(fileBufs), mimetype });
    });

    req.pipe(bb);
  });
}

function keysToUpper<T extends Record<string, any>>(obj: T | null): Record<string, any> | null {
  if (!obj) return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) out[k.toUpperCase()] = v;
  return out;
}

function mockSapFromExtracted(f: InvoiceFields): Record<string, any> {
  const iso = (s?: string) => s || '2025-10-01';
  const plus = (n?: number, d = 5) => (typeof n === 'number' ? n + d : 100 + d);
  return {
    ID: `MOCK-${f.invoiceNo ?? 'INV-0001'}`,
    INVOICE_NO: f.invoiceNo ?? 'INV-0001',
    VENDOR_ID: f.vendorId ?? 'SUP-001',
    CURRENCY: f.currency ?? 'USD',
    AMOUNT: plus(f.amount, 5),
    INVOICE_DATE: iso(f.invoiceDate),
    DUE_DATE: f.dueDate ? f.dueDate : '2025-10-15',
    PO_NUMBER: f.poNumber ?? 'PO-1234',
    UPDATED_AT: new Date().toISOString()
  };
}

export const testInvoice = onRequest({ timeoutSeconds: 120, memory: '1GiB' }, async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).send('POST multipart/form-data with a PDF or image file (PNG/JPEG).'); return; }

  try {
    const mock = String(req.query.mock || '').toLowerCase() === '1' || String(req.query.mock || '').toLowerCase() === 'true';
    const { buffer, mimetype, filename } = await parseMultipart(req);

    let extracted: InvoiceFields;
    let modelUsed = 'regex-only';
    if (mimetype.includes('pdf')) {
      // 1) Extract entities from PDF
      extracted = await extractInvoiceFieldsFromPdf(buffer);
      modelUsed = process.env.OPENAI_API_KEY ? 'regex + LLM' : 'regex-only';
    } else if (mimetype.startsWith('image/')) {
      // 1) Extract entities from image (vision)
      try {
        extracted = await extractInvoiceFieldsFromImage(buffer, mimetype);
        modelUsed = 'vision LLM';
      } catch (e: any) {
        res.status(400).json({ error: 'Image extraction requires OPENAI_API_KEY to be set.' });
        return;
      }
    } else {
      res.status(400).json({ error: 'Unsupported file type. Please upload a PDF or image (PNG/JPEG).' });
      return;
    }

    // 2) Look up SAP (or mock)
    let sapRow: Record<string, any> | null = null;
    if (mock || !env.HANA_HOST || !env.HANA_USER) {
      sapRow = mockSapFromExtracted(extracted);
    } else {
      sapRow = await fetchInvoiceByIdentifiers({
        invoiceNo: extracted.invoiceNo,
        vendorId: extracted.vendorId,
        currency: extracted.currency,
        amount: extracted.amount,
        invoiceDate: extracted.invoiceDate,
        poNumber: extracted.poNumber
      });
      sapRow = keysToUpper(sapRow);
    }

    // 3) Compare
    const incoherences = sapRow ? findIncoherences(extracted, sapRow) : [];
    const matched = !!sapRow;

    res.status(200).json({
      file: { filename, mimetype, bytes: buffer.length },
      extracted,
      sap: sapRow,
      matched,
      incoherences,
      modelUsed,
      tolerance: env.AMOUNT_TOLERANCE
    });
    return;
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) });
    return;
  }
});
