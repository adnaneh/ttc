import { readByPtr } from './storage';
import YAML from 'yaml';

export async function loadMockOffers(ptr?: string): Promise<any[]> {
  if (!ptr) return [];
  try {
    const buf = await readByPtr(ptr);
    const txt = buf.toString('utf8');
    const data = ptr.endsWith('.yaml') || ptr.endsWith('.yml') ? YAML.parse(txt) : JSON.parse(txt);
    if (Array.isArray(data)) return data;
    if (Array.isArray((data as any)?.offers)) return (data as any).offers;
    if (Array.isArray((data as any)?.results)) return (data as any).results;
    return [];
  } catch {
    return [];
  }
}

export function synthesizeOffers(params: { pol: string; pod: string; equipment: string; carrier: string }) {
  const { pol, pod, equipment, carrier } = params;
  const hash = (s: string) => Array.from(s).reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = equipment.startsWith('20') ? 900 : equipment.startsWith('40') ? 1500 : 1800;
  const delta = hash(pol + pod + equipment + carrier) % 300;
  const tt = 20 + (hash(pol + pod) % 15);
  const today = new Date();
  const plus = (d: number) => new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10);
  return [
    { totalPrice: base + delta, currency: 'USD', transitDays: tt, freeTime: 7, validTo: plus(14) },
    { totalPrice: base + delta + 80, currency: 'USD', transitDays: tt - 1, freeTime: 5, validTo: plus(10) }
  ];
}

