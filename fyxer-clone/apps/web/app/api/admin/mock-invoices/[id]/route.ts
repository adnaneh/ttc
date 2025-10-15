import { env } from '@/lib/env';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = env.FUNCTIONS_URL;
  const res = await fetch(`${base}/adminMockInvoicesGet?id=${encodeURIComponent(id)}`, {
    headers: { 'x-admin-token': process.env.ADMIN_DASHBOARD_TOKEN as string }
  });
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = env.FUNCTIONS_URL;
  const patch = await req.json();
  const res = await fetch(`${base}/adminMockInvoicesUpdate`, {
    method: 'POST',
    headers: {
      'x-admin-token': process.env.ADMIN_DASHBOARD_TOKEN as string,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ id, patch })
  });
  const body = await res.text();
  return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}
