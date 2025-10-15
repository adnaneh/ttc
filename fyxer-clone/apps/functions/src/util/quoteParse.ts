export type ShipmentIntent = {
  isQuoteRequest: boolean;
  customerName?: string;
};

export type ShipmentSpec = {
  qty?: number;
  equipment?: string; // 40HC, 20GP, 45HC, NOR, RF...
  pol?: string; // CNSHA
  pod?: string; // DEHAM
  service?: string; // CY/CY, CY/DOOR, etc.
  etd?: string; // YYYY-MM-DD
  incoterms?: string; // FOB/CIF/etc. (optional)
};

const ARROW = '(?:->|→|to|\\s+[-–]\\s+)';

export function detectIntent(text: string, keywords: string[]): ShipmentIntent {
  const low = text.toLowerCase();
  const isQuote = keywords.some(k => low.includes(k));
  return { isQuoteRequest: isQuote };
}

export function parseShipment(text: string): ShipmentSpec {
  const t = text.replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();

  // 1×40 HC CNSHA → DEHAM, CY/CY
  const m1 = t.match(new RegExp(
    String.raw`(\d+)\s*[x×]?\s*(20|40|45)\s*([A-Za-z]{2})?\s*(GP|HC|HQ|NOR|RF|OT|FR)?[^A-Za-z0-9]{1,6}([A-Z]{2}[A-Z]{3})\s*${ARROW}\s*([A-Z]{2}[A-Z]{3})(?:[^A-Za-z0-9]+(CY\/CY|CY\/DOOR|DOOR\/CY|DOOR\/DOOR))?`,
    'i'
  ));
  if (m1) {
    const qty = Number(m1[1]);
    const feet = m1[2];
    const eq2 = (m1[3] || '').toUpperCase();
    const eq3 = (m1[4] || '').toUpperCase();
    const equipment = (feet + (eq3 || (eq2 === 'HC' ? 'HC' : 'GP'))).replace('HQ', 'HC');
    const pol = m1[5].toUpperCase();
    const pod = m1[6].toUpperCase();
    const service = (m1[7] || 'CY/CY').toUpperCase();
    return { qty, equipment, pol, pod, service };
  }

  // Fallbacks: "40HC from CNSHA to DEHAM", etc.
  const qty = Number(t.match(/(\d+)\s*(x|×)?\s*(?:ctr|cntr|container)/i)?.[1] || '1');
  const equipment = (t.match(/(20|40|45)\s*(GP|HC|HQ|RF|NOR|OT|FR)/i)?.[0] || '')
    .replace(/\s+/g, '')
    .replace('HQ', 'HC')
    .toUpperCase() || undefined;
  const pol = t.match(/\b([A-Z]{2}[A-Z]{3})\b\s*(?:to|->|→)/)?.[1]?.toUpperCase() ||
    t.match(/from\s+([A-Z]{2}[A-Z]{3})/i)?.[1]?.toUpperCase();
  const pod = t.match(/(?:to|->|→)\s*([A-Z]{2}[A-Z]{3})/i)?.[1]?.toUpperCase() ||
    t.match(/to\s+([A-Z]{2}[A-Z]{3})/i)?.[1]?.toUpperCase();
  const service = (t.match(/\b(CY\/CY|CY\/DOOR|DOOR\/CY|DOOR\/DOOR)\b/i)?.[1] || 'CY/CY').toUpperCase();
  const etdDate = t.match(/\bETD[:\s]+([0-3]?\d[\/\.\-][01]?\d[\/\.\-]\d{2,4})/i)?.[1];
  const norm = (s?: string) => s
    ? s.replace(/(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{2,4})/, (_,$d,$m,$y) => `${$y.length===2? '20'+$y : $y}-${$m.padStart(2,'0')}-${$d.padStart(2,'0')}`)
    : undefined;
  return {
    qty: Number.isFinite(qty) ? qty : undefined,
    equipment,
    pol,
    pod,
    service,
    etd: norm(etdDate)
  };
}

