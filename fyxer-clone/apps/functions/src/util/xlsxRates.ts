import { Storage } from '@google-cloud/storage';
import * as XLSX from 'xlsx';

export type DealRow = {
  pol: string; pod: string; equipment: string;
  carrier?: string;
  baseRate: number; currency: string;
  validFrom?: string; validTo?: string;
  transitDays?: number;
  freeTimeDays?: number;
  notes?: string;
};

function parseNum(x: any) {
  return typeof x === 'number' ? x : Number(String(x).replace(/[^\d.,-]/g, '').replace(',', '.')) || 0;
}

export async function loadDealsFromXlsx(): Promise<DealRow[]> {
  const ptr = process.env.RATES_XLSX_PTR;
  if (!ptr) return [];
  if (!ptr.startsWith('gs://')) throw new Error(`RATES_XLSX_PTR must be gs://... (got ${ptr})`);
  const parts = ptr.replace('gs://', '').split('/');
  const bucket = parts.shift()!;
  const path = parts.join('/');
  const storage = new Storage();
  const [buf] = await storage.bucket(bucket).file(path).download();
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sh = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<any>(sh, { defval: '' });
  return rows.map(r => ({
    pol: String(r.pol || r.POL || r.origin || '').toUpperCase(),
    pod: String(r.pod || r.POD || r.destination || '').toUpperCase(),
    equipment: String(r.equipment || r.Equipment || r.cntr || '').toUpperCase().replace(/\s+/g, ''),
    carrier: r.carrier || r.Carrier || '',
    baseRate: parseNum(r.baseRate ?? r.rate ?? r.Price),
    currency: (r.currency || r.Currency || 'USD').toUpperCase(),
    validFrom: r.validFrom || r.ValidFrom || undefined,
    validTo: r.validTo || r.ValidTo || undefined,
    transitDays: parseNum(r.transitDays ?? r.TT ?? 0),
    freeTimeDays: parseNum(r.freeTime ?? r.FreeTime ?? 0),
    notes: r.notes || r.Notes || ''
  }));
}

