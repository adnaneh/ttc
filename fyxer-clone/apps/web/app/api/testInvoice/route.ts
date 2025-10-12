export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const mock = url.searchParams.get('mock') ?? '1';

    const base = process.env.FUNCTIONS_URL || 'http://127.0.0.1:5001/demo-no-project/us-central1';
    const target = `${base}/testInvoice?mock=${encodeURIComponent(mock)}`;

    const form = await req.formData();
    const invoice = form.get('invoice');
    if (!(invoice instanceof File)) {
      return Response.json({ error: 'Missing invoice file' }, { status: 400 });
    }

    const fd = new FormData();
    fd.append('invoice', invoice, (invoice as File).name);

    const res = await fetch(target, { method: 'POST', body: fd });
    const text = await res.text();
    const contentType = res.headers.get('content-type') || 'application/json; charset=utf-8';
    return new Response(text, { status: res.status, headers: { 'content-type': contentType } });
  } catch (e: any) {
    return Response.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
