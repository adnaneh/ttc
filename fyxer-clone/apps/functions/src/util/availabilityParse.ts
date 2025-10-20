import type { Slot } from './availability';

export type AvailIntent = {
  isAvailability: boolean;
  constraints: {
    dayPart?: 'morning'|'afternoon'|'evening';
    onDate?: string;               // YYYY-MM-DD
    durationMinOverride?: number;
  }
};

const DOW = ['sun','mon','tue','wed','thu','fri','sat'];

function toISO(y:number,m:number,d:number) {
  return new Date(Date.UTC(y, m-1, d, 0,0,0)).toISOString().slice(0,10);
}

export function detectAvailabilityIntent(text: string): AvailIntent {
  const low = (text || '').toLowerCase();
  const ask = /(are you|you|u)\s+(free|available)|availability|meet|meeting|call|chat|schedule|find.*time|set up.*(call|meeting)/i.test(low);
  if (!ask) return { isAvailability: false, constraints: {} };

  const constraints: AvailIntent['constraints'] = {};
  if (/morning/i.test(text)) constraints.dayPart = 'morning';
  else if (/afternoon/i.test(text)) constraints.dayPart = 'afternoon';
  else if (/evening|late/i.test(text)) constraints.dayPart = 'evening';

  const today = new Date();
  const mIso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (mIso) constraints.onDate = `${mIso[1]}-${mIso[2]}-${mIso[3]}`;
  else {
    const mEU = text.match(/\b([0-3]?\d)[\/.]([01]?\d)\b/);
    if (mEU) {
      const d = Number(mEU[1]); const m = Number(mEU[2]);
      constraints.onDate = toISO(today.getUTCFullYear(), m, d);
    }
    const mUS = text.match(/\b([01]?\d)[\/.]([0-3]?\d)\b/);
    if (!constraints.onDate && mUS) {
      const m = Number(mUS[1]); const d = Number(mUS[2]);
      constraints.onDate = toISO(today.getUTCFullYear(), m, d);
    }
  }

  const mTomorrow = /tomorrow/i.test(text);
  if (!constraints.onDate && mTomorrow) {
    const t = new Date(Date.now() + 24*60*60*1000);
    constraints.onDate = t.toISOString().slice(0,10);
  }

  const mDow = DOW.find(abbr => new RegExp(`\\b${abbr}\\w*`, 'i').test(low));
  if (!constraints.onDate && mDow) {
    const idx = DOW.indexOf(mDow); // 0=Sun
    const nowDow = new Date().getDay(); // 0=Sun
    let delta = idx - nowDow; if (delta <= 0) delta += 7;
    const target = new Date(Date.now() + delta*24*60*60*1000);
    constraints.onDate = target.toISOString().slice(0,10);
  }

  const mdur = low.match(/(\d{1,2})\s*(min|minutes|m|hour|hr|h)/);
  if (mdur) {
    const n = Number(mdur[1]);
    const unit = mdur[2][0];
    constraints.durationMinOverride = unit === 'h' ? n*60 : n;
  }

  return { isAvailability: true, constraints };
}

// ---- Proposed time parsing (simple pattern-based) ----

function detectTzIana(text: string): string | undefined {
  const low = text.toLowerCase();
  if (/\bpacific\b|\b\(pt\)\b|\b\b(pdt|pst)\b/.test(low)) return 'America/Los_Angeles';
  if (/\beastern\b|\b\(et\)\b|\b\b(edt|est)\b/.test(low)) return 'America/New_York';
  if (/\bcentral\b|\b\(ct\)\b|\b\b(cdt|cst)\b/.test(low)) return 'America/Chicago';
  if (/\bmountain\b|\b\(mt\)\b|\b\b(mdt|mst)\b/.test(low)) return 'America/Denver';
  if (/\bberlin\b|\bce(s|t)\b/.test(low)) return 'Europe/Berlin';
  if (/\blondon\b|\b(gmt|bst)\b/.test(low)) return 'Europe/London';
  return undefined;
}

function getOffsetMinutesFor(dateMs: number, tz: string): number {
  const d = new Date(dateMs);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = fmt.formatToParts(d);
  const map: any = {};
  for (const p of parts) map[p.type] = p.value;
  const localAsUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
  return Math.round((localAsUTC - d.getTime()) / 60000); // minutes; local - utc
}

function parseMonth(m: string): number | undefined {
  const s = m.toLowerCase().slice(0, 3);
  const map: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  return map[s];
}

function parseIntSafe(v: string | undefined): number | undefined {
  if (!v) return undefined; const n = Number(v); return Number.isFinite(n) ? n : undefined;
}

function to24h(h: number, ampm?: string): number { if (!ampm) return h; const p = ampm.toLowerCase(); if (p === 'am') return h === 12 ? 0 : h; return h === 12 ? 12 : h + 12; }

/**
 * Extract proposed meeting slots from free-form text.
 * Supports formats like: "Oct 21, 2025, 10:00-10:30 AM" (with optional bullets)
 * Returns UTC-based Slot[] plus a best-effort display timezone.
 */
export function extractProposedSlots(text: string, fallbackTz?: string): { slots: Slot[]; displayTz?: string } {
  const slots: Slot[] = [];
  const normalized = text.replace(/[\u2013\u2014\u2212\u2010]/g, '-'); // en dash/em dash/minus/figure dash → '-'

  // Try to detect IANA tz name first
  let displayTz = detectTzIana(normalized) || fallbackTz;

  // Regex for patterns like: Oct 21, 2025, 10:00-10:30 AM
  const re = /(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,\s*(\d{4}))?[^\d\n]*?(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/g;

  let m: RegExpExecArray | null;
  const currentYear = new Date().getUTCFullYear();
  while ((m = re.exec(normalized)) !== null) {
    const mo = parseMonth(m[1]); if (!mo) continue;
    const day = parseIntSafe(m[2]); if (!day) continue;
    const year = parseIntSafe(m[3]) || currentYear;
    const h1 = parseIntSafe(m[4]) || 0;
    const min1 = parseIntSafe(m[5]) || 0;
    const h2 = parseIntSafe(m[6]) || h1;
    const min2 = parseIntSafe(m[7]) || min1;
    const ampm = m[8];
    const H1 = to24h(h1, ampm);
    const H2 = to24h(h2, ampm);

    // Build naive UTC timestamp then adjust using detected timezone (if available)
    const naiveStartUTC = Date.UTC(year, mo - 1, day, H1, min1, 0);
    const naiveEndUTC = Date.UTC(year, mo - 1, day, H2, min2, 0);

    let startMs = naiveStartUTC;
    let endMs = naiveEndUTC;

    if (displayTz) {
      const offStart = getOffsetMinutesFor(naiveStartUTC, displayTz);
      const offEnd = getOffsetMinutesFor(naiveEndUTC, displayTz);
      startMs = naiveStartUTC - offStart * 60000;
      endMs = naiveEndUTC - offEnd * 60000;
    }

    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      slots.push({ startMs, endMs });
    }
  }

  return { slots, displayTz };
}
