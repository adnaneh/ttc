import pdfParse from 'pdf-parse';
import OpenAI from 'openai';
import { env } from '../env';

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export type InvoiceFields = {
  invoiceNo?: string;
  vendorId?: string;
  vendorName?: string;
  currency?: string;
  amount?: number;
  invoiceDate?: string;  // YYYY-MM-DD
  dueDate?: string;      // YYYY-MM-DD
  poNumber?: string;
};

function regexExtract(text: string): InvoiceFields {
  const t = text.replace(/\r/g, '');
  const get = (re: RegExp, i = 1) => (t.match(re)?.[i] || '').trim();
  const num = (s: string) => Number(s.replace(/[^\d.,-]/g, '').replace(/\.(?=.*\.)/g, '').replace(',', '.')); // naive

  const invoiceNo = get(/invoice\s*(no\.?|number|#|nº)?\s*[:\-]?\s*([A-Z0-9\-\/]{5,})/i, 2);
  const poNumber  = get(/PO\s*(number|#)?\s*[:\-]?\s*([A-Z0-9\-\/]{4,})/i, 2);
  const currency  = get(/\b(USD|EUR|GBP|CHF|JPY|AUD|CAD|MXN|BRL|ZAR|INR|CNY)\b/i);
  const amountStr = get(/total\s*(amount)?\s*[:\-]?\s*([0-9][0-9.,\s]{1,15})/i, 2) || get(/amount\s*due\s*[:\-]?\s*([0-9][0-9.,\s]{1,15})/i, 1);
  const vendorId  = get(/(tax\s*id|vat\s*id|supplier\s*id)\s*[:\-]?\s*([A-Z0-9\-]{6,})/i, 2);
  const dateStr   = get(/invoice\s*date\s*[:\-]?\s*([0-3]?\d[\/.\-][01]?\d[\/.\-]\d{2,4})/i, 1);
  const dueStr    = get(/due\s*date\s*[:\-]?\s*([0-3]?\d[\/.\-][01]?\d[\/.\-]\d{2,4})/i, 1);

  const normDate = (s: string) => {
    if (!s) return '';
    const [d, m, y] = s.includes('-') ? s.split('-') : s.includes('.') ? s.split('.') : s.split('/');
    const yyyy = (y.length === 2 ? '20' + y : y);
    const dd = d.padStart(2, '0');
    const mm = m.padStart(2, '0');
    // If the regex captured yyyy-mm-dd already, guard
    if (Number(d) > 1900) return s; // already ISO-ish
    return `${yyyy}-${mm}-${dd}`;
  };

  const res: InvoiceFields = {
    invoiceNo: invoiceNo || undefined,
    vendorId: vendorId || undefined,
    currency: currency || undefined,
    amount: amountStr ? num(amountStr) : undefined,
    invoiceDate: dateStr ? normDate(dateStr) : undefined,
    dueDate: dueStr ? normDate(dueStr) : undefined,
    poNumber: poNumber || undefined
  };
  return res;
}

export async function extractInvoiceFieldsFromPdf(buf: Buffer): Promise<InvoiceFields> {
  const parsed = await pdfParse(buf);
  const base = regexExtract(parsed.text || '');

  if (!openai) return base;

  // Use LLM to refine (robust to weird layouts)
  try {
    const prompt = `Extract invoice fields as strict JSON with keys:
{ "invoiceNo": string?, "vendorId": string?, "vendorName": string?, "currency": string?, "amount": number?, "invoiceDate": "YYYY-MM-DD"?, "dueDate": "YYYY-MM-DD"?, "poNumber": string? }.
Use null for unknown. Return ONLY JSON.`;
    const resp = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      response_format: { type: 'json_object' as const },
      messages: [{ role: 'system', content: prompt }, { role: 'user', content: (parsed.text || '').slice(0, 15000) }]
    });
    const json = (resp.choices?.[0]?.message as any)?.content || '{}';
    const obj = JSON.parse(json);
    // Merge LLM over regex defaults
    const merged: InvoiceFields = { ...base, ...obj };
    Object.keys(merged).forEach(k => (merged as any)[k] == null && delete (merged as any)[k]);
    return merged;
  } catch {
    return base;
  }
}

