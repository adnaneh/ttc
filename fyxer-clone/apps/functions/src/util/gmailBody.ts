function b64urlToBuf(s: string) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

type Part = {
  mimeType?: string;
  body?: { data?: string };
  parts?: Part[];
};

export function extractHtmlFromPayload(payload?: Part): { html: string; textFallback?: string } {
  if (!payload) return { html: '' };

  let html = '';
  let text = '';

  const walk = (p: Part) => {
    if (p.body?.data) {
      const decoded = b64urlToBuf(p.body.data).toString('utf8');
      if (p.mimeType?.includes('text/html')) html += decoded;
      else if (p.mimeType?.includes('text/plain')) text += decoded;
    }
    (p.parts ?? []).forEach(walk);
  };
  walk(payload);

  if (html.trim()) return { html, textFallback: text.trim() || undefined };
  if (text.trim()) {
    // Minimal plaintext → HTML
    const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return { html: `<pre style="white-space:pre-wrap">${safe}</pre>` };
  }
  return { html: '' };
}

