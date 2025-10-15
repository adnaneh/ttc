import { env } from '@/lib/env';

export async function GET(req: Request) {
  const base = env.FUNCTIONS_URL;
  const url = new URL(req.url);
  const qs = url.search ? url.search : '';
  const res = await fetch(`${base}/adminMockInvoicesList${qs}`, {
    headers: { 'x-admin-token': process.env.ADMIN_DASHBOARD_TOKEN as string }
  });
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

