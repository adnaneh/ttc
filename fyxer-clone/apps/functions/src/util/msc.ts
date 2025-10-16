import { loadMockOffers, synthesizeOffers } from './mock';

function envStr(name: string) { return process.env[name] ? String(process.env[name]) : undefined; }
function envBool(name: string) { const v = String(process.env[name] ?? '').toLowerCase(); return v === 'true'; }

async function mscGetToken(): Promise<string | null> {
  if (envBool('MSC_MOCK')) return null;
  const authUrl = envStr('MSC_AUTH_URL');
  const clientId = envStr('MSC_CLIENT_ID');
  const clientSecret = envStr('MSC_CLIENT_SECRET');
  if (!authUrl || !clientId || !clientSecret) return null;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'rates.read' });
  const res = await fetch(authUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) return null;
  const json = await res.json();
  return (json as any)?.access_token || null;
}

export async function mscQueryRates(q: { pol: string; pod: string; equipment: string }): Promise<any[]> {
  if (envBool('MSC_MOCK')) {
    const file = envStr('MSC_MOCK_FILE');
    const offers = await loadMockOffers(file);
    return offers.length ? offers : synthesizeOffers({ ...q, carrier: 'MSC' });
  }
  const ratesUrl = envStr('MSC_RATES_URL');
  if (!ratesUrl) return [];
  const token = await mscGetToken();
  const apiKey = envStr('MSC_API_KEY');
  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : (apiKey ? { 'x-api-key': apiKey } : {});
  if (!Object.keys(headers).length) return [];

  const url = new URL(ratesUrl);
  url.searchParams.set('origin', q.pol);
  url.searchParams.set('destination', q.pod);
  url.searchParams.set('equipment', q.equipment);

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) return [];
  const data = await res.json();
  const rows = Array.isArray((data as any)?.offers || data) ? ((data as any).offers || data) : [];
  return rows;
}
