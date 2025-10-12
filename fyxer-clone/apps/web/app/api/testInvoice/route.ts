export const runtime = 'nodejs';

// Proxy the original multipart request body directly to the Cloud Function
// to avoid any re-encoding issues that can cause Busboy to error with
// "Unexpected end of form".
export async function POST(req: Request) {
  const url = new URL(req.url);
  const mock = url.searchParams.get('mock') ?? '1';

  const base = process.env.FUNCTIONS_URL;
  if (!base) return Response.json({ error: 'Missing FUNCTIONS_URL env var' }, { status: 500 });

  const target = `${base}/testInvoice?mock=${encodeURIComponent(mock)}`;

  // Forward headers, but drop hop-by-hop/problematic ones
  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.delete('content-encoding');

  const resp = await fetch(target, {
    method: 'POST',
    headers,
    // Node requires duplex when streaming a request body
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    duplex: 'half' as any,
    body: req.body as any,
  });

  return new Response(resp.body, {
    status: resp.status,
    headers: { 'content-type': resp.headers.get('content-type') || 'application/json; charset=utf-8' }
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
