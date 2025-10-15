import { loadDealsFromXlsx, DealRow } from './xlsxRates';
import { maerskQuerySpotRates } from './maersk';
import { mscQueryRates } from './msc';

export type QuoteItem = {
  source: 'excel' | 'maersk' | 'msc';
  carrier: string;
  equipment: string;
  pol: string; pod: string;
  price: number; currency: string;
  transitDays?: number;
  freeTimeDays?: number;
  validityTo?: string;
  notes?: string;
};

// 1) Excel (always available if ptr present)
export async function queryDealsExcel(q: { pol: string; pod: string; equipment: string }): Promise<QuoteItem[]> {
  const rows = await loadDealsFromXlsx();
  return rows
    .filter(r => r.pol === q.pol && r.pod === q.pod && r.equipment === q.equipment)
    .map<QuoteItem>(r => ({
      source: 'excel' as const,
      carrier: r.carrier || '—',
      equipment: r.equipment, pol: r.pol, pod: r.pod,
      price: r.baseRate, currency: r.currency,
      transitDays: r.transitDays, freeTimeDays: r.freeTimeDays,
      validityTo: r.validTo, notes: r.notes
    }));
}

// 2) Maersk Spot (only if creds present). Placeholder until API access is configured
export async function queryMaerskSpot(q: { pol: string; pod: string; equipment: string }): Promise<QuoteItem[]> {
  try {
    const offers = await maerskQuerySpotRates(q);
    return offers.map((d: any) => ({
      source: 'maersk' as const, carrier: 'MAERSK',
      equipment: q.equipment, pol: q.pol, pod: q.pod,
      price: Number(d?.totalPrice ?? d?.price ?? 0), currency: (d?.currency || 'USD').toUpperCase(),
      transitDays: Number(d?.transitDays ?? d?.tt ?? 0) || undefined,
      freeTimeDays: Number(d?.freeTime ?? 0) || undefined,
      validityTo: d?.validTo
    })).filter(x => Number.isFinite(x.price) && x.price > 0);
  } catch {
    return [];
  }
}

// 3) MSC Instant/Contract Rates (only if API key present). Placeholder
export async function queryMSC(q: { pol: string; pod: string; equipment: string }): Promise<QuoteItem[]> {
  try {
    const offers = await mscQueryRates(q);
    return offers.map((d: any) => ({
      source: 'msc' as const, carrier: 'MSC',
      equipment: q.equipment, pol: q.pol, pod: q.pod,
      price: Number(d?.total ?? d?.price ?? 0), currency: (d?.currency || 'USD').toUpperCase(),
      transitDays: Number(d?.tt ?? d?.transitDays ?? 0) || undefined,
      freeTimeDays: Number(d?.free ?? 0) || undefined,
      validityTo: d?.validTo
    })).filter(x => Number.isFinite(x.price) && x.price > 0);
  } catch {
    return [];
  }
}

export async function compileQuotes(q: { pol: string; pod: string; equipment: string }) {
  const [fromExcel, fromMaersk, fromMSC] = await Promise.all([
    queryDealsExcel(q), queryMaerskSpot(q), queryMSC(q)
  ]);

  const all = [...fromExcel, ...fromMaersk, ...fromMSC].filter(x => Number.isFinite(x.price));
  all.sort((a, b) => a.price - b.price);
  return all.slice(0, 5);
}
