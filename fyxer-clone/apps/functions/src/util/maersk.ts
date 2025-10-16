import { loadMockOffers, synthesizeOffers } from './mock';

function envBool(name: string) { const v = String(process.env[name] ?? '').toLowerCase(); return v === 'true'; }

export async function maerskGetToken(): Promise<string | null> {
  if (envBool('MAERSK_MOCK')) return null;
  const clientId = process.env.MAERSK_CLIENT_ID;
  const clientSecret = process.env.MAERSK_CLIENT_SECRET;
  const authUrl = process.env.MAERSK_AUTH_URL;
  if (!clientId || !clientSecret || !authUrl) return null;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'rates.read' });
  const res = await fetch(authUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`Maersk auth failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return (json as any).access_token as string;
}

export async function maerskQuerySpotRates(q: { pol: string; pod: string; equipment: string }): Promise<any[]> {
  if (envBool('MAERSK_MOCK')) {
    const file = String(process.env.MAERSK_MOCK_FILE || '');
    const offers = await loadMockOffers(file);
    return offers.length ? offers : synthesizeOffers({ ...q, carrier: 'MAERSK' });
  }
  const ratesUrl = process.env.MAERSK_RATES_URL;
  const customer = process.env.MAERSK_CUSTOMER_CODE;
  const token = await maerskGetToken();
  if (!token || !ratesUrl || !customer) return [];
  const url = new URL(ratesUrl);
  url.searchParams.set('origin', q.pol);
  url.searchParams.set('destination', q.pod);
  url.searchParams.set('equipment', q.equipment);
  url.searchParams.set('customerCode', customer);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray((data as any)?.offers || data) ? ((data as any).offers || data) : [];
}
