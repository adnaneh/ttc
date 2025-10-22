// Lightweight, dependency-free availability agent.
// - Parses sender proposals via existing extractProposedSlots
// - Enforces future-only + min-notice + non-overlap on proposals
// - If none valid, computes suggestions within workdays/hours
// - Fetches busy via provided callbacks (gcal/outlook) but degrades gracefully

import { extractProposedSlots } from '../util/availabilityParse';

type Interval = { startMs: number; endMs: number };
type BusyFetcher = (opts: { startMs: number; endMs: number; timezone?: string }) => Promise<Interval[]>;

export interface AiGetCalendarAvailabilityParams {
  text: string;
  timezone: string;
  lookaheadDays: number;
  gcalBusy?: BusyFetcher | null;
  outlookBusy?: BusyFetcher | null;
  cfg?: {
    minNoticeMin: number;
    workDays: number[];         // 1=Mon..7=Sun (matches existing CalConfig)
    workStartMin: number;
    workEndMin: number;
    durationMin: number;
    slotIncrementMin: number;
    suggestCount: number;
    timezone: string;
  };
}

export async function aiGetCalendarAvailability(params: AiGetCalendarAvailabilityParams)
  : Promise<{ suggestedTimes: Interval[] } | null> {
  const { text, timezone, lookaheadDays, gcalBusy, outlookBusy, cfg: cfgIn } = params;

  const cfg = cfgIn ?? {
    minNoticeMin: 120,
    workDays: [1, 2, 3, 4, 5],
    workStartMin: 9 * 60,
    workEndMin: 17 * 60,
    durationMin: 30,
    slotIncrementMin: 30,
    suggestCount: 3,
    timezone
  };

  const nowMs = Date.now();
  const minNoticeMs = cfg.minNoticeMin * 60_000;
  const horizonMs = nowMs + lookaheadDays * 24 * 60 * 60_000;

  // Busy aggregation
  let busy: Interval[] = [];
  try {
    if (gcalBusy) {
      const g = await gcalBusy({ startMs: nowMs, endMs: horizonMs, timezone });
      if (Array.isArray(g)) busy.push(...g);
    }
    if (outlookBusy) {
      const o = await outlookBusy({ startMs: nowMs, endMs: horizonMs, timezone });
      if (Array.isArray(o)) busy.push(...o);
    }
  } catch (err) {
    // Graceful degradation: treat as no busy data
    // eslint-disable-next-line no-console
    console.warn('[aiGetCalendarAvailability] busy fetch failed:', err);
  }
  busy = normalizeAndSort(busy);

  // Proposed options from the sender
  const proposed = safeExtractProposals(text, timezone);
  const filtered = proposed
    .filter(s => s.startMs >= nowMs + minNoticeMs)
    .filter(s => !overlapsAny(s, busy))
    .sort((a, b) => a.startMs - b.startMs);

  if (filtered.length > 0) return { suggestedTimes: [filtered[0]] };

  // Compute suggestions if no valid proposed slot
  const suggestions = buildSuggestions({
    busy,
    cfg: cfg as Required<NonNullable<AiGetCalendarAvailabilityParams['cfg']>>,
    windowStartMs: nowMs + minNoticeMs,
    windowEndMs: horizonMs,
    durationMin: cfg.durationMin
  });

  if (!suggestions.length) return null;
  return { suggestedTimes: suggestions };
}

// ----------------------
// Helpers
// ----------------------
function safeExtractProposals(text: string, timezone: string): Interval[] {
  try {
    const res = extractProposedSlots(text, timezone);
    const slots = Array.isArray(res?.slots) ? res.slots : [];
    return slots.map(normalizeInterval).filter(s => s.endMs > s.startMs);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[aiGetCalendarAvailability] extractProposedSlots error', e);
    return [];
  }
}

function normalizeInterval(s: any): Interval {
  return { startMs: Number(s?.startMs ?? s?.start ?? 0), endMs: Number(s?.endMs ?? s?.end ?? 0) };
}

function normalizeAndSort(busy: Interval[]): Interval[] {
  const list = busy.map(normalizeInterval).filter(b => b.endMs > b.startMs);
  list.sort((a, b) => a.startMs - b.startMs);
  const merged: Interval[] = [];
  for (const b of list) {
    if (merged.length === 0) { merged.push({ ...b }); continue; }
    const last = merged[merged.length - 1];
    if (b.startMs <= last.endMs) last.endMs = Math.max(last.endMs, b.endMs);
    else merged.push({ ...b });
  }
  return merged;
}

function overlaps(a: Interval, b: Interval): boolean { return a.startMs < b.endMs && b.startMs < a.endMs; }
function overlapsAny(a: Interval, blocks: Interval[]) { return blocks.some(b => overlaps(a, b)); }

function minutesOfDay(ms: number, timezone?: string) {
  const dtf = new Intl.DateTimeFormat('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: timezone });
  const parts = dtf.formatToParts(new Date(ms));
  const hh = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
  const mm = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
  return hh * 60 + mm;
}

function dayOfWeek1to7(ms: number, timezone?: string) {
  const dtf = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone });
  const name = dtf.format(new Date(ms)).toLowerCase().slice(0, 3);
  const map: Record<string, number> = { sun: 7, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
  return map[name] || 1;
}

function ceilToIncrement(ms: number, incrementMin: number, timezone?: string) {
  const mins = minutesOfDay(ms, timezone);
  const roundedMins = Math.ceil(mins / incrementMin) * incrementMin;
  const deltaMin = roundedMins - mins;
  return ms + deltaMin * 60_000;
}

function startOfDay(ms: number, timezone?: string) {
  const mins = minutesOfDay(ms, timezone);
  return ms - mins * 60_000;
}

function buildSuggestions(opts: {
  busy: Interval[];
  cfg: Required<AiGetCalendarAvailabilityParams['cfg']>;
  windowStartMs: number;
  windowEndMs: number;
  durationMin: number;
}): Interval[] {
  const { busy, cfg, windowStartMs, windowEndMs, durationMin } = opts;
  const out: Interval[] = [];
  const incMs = cfg.slotIncrementMin * 60_000;
  const durMs = durationMin * 60_000;

  let cursor = ceilToIncrement(windowStartMs, cfg.slotIncrementMin, cfg.timezone);

  while (cursor + durMs <= windowEndMs && out.length < cfg.suggestCount) {
    const dow = dayOfWeek1to7(cursor, cfg.timezone);
    const isWorkday = cfg.workDays.includes(dow);
    if (!isWorkday) {
      const sod = startOfDay(cursor, cfg.timezone);
      cursor = sod + 24 * 60 * 60_000;
      continue;
    }
    const mins = minutesOfDay(cursor, cfg.timezone);
    const withinHours = mins >= cfg.workStartMin && (mins + durationMin) <= cfg.workEndMin;
    const slot: Interval = { startMs: cursor, endMs: cursor + durMs };
    if (withinHours && !overlapsAny(slot, busy)) {
      out.push(slot);
      cursor = slot.endMs; // jump after slot to avoid back-to-back duplicates
      continue;
    }
    cursor += incMs;
  }
  return out;
}

