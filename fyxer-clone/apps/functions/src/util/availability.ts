import { CalConfig } from './calendarConfig';

export type AvailConstraints = {
  dayPart?: 'morning' | 'afternoon' | 'evening';
  onDate?: string; // YYYY-MM-DD
  durationMinOverride?: number;
};

export type Slot = { startMs: number; endMs: number };

function startOfDayMs(ms: number, tz: string): number {
  const d = new Date(ms);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find(p => p.type === 'year')?.value);
  const m = Number(parts.find(p => p.type === 'month')?.value);
  const day = Number(parts.find(p => p.type === 'day')?.value);
  const local = new Date(Date.UTC(y, m - 1, day, 0, 0, 0));
  return local.getTime();
}

function addMinutes(ms: number, min: number) { return ms + min * 60 * 1000; }

function dayOfWeek(ms: number, tz: string): number {
  const d = new Date(ms);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
  const wd = fmt.format(d).slice(0, 3).toLowerCase();
  return ({ mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 } as any)[wd] || 1;
}

export function expandBusy(busy: Slot[], bufferMin: number): Slot[] {
  if (!bufferMin) return busy;
  const b = bufferMin * 60 * 1000;
  return busy.map(s => ({ startMs: s.startMs - b, endMs: s.endMs + b }));
}

export function invertToFree(busy: Slot[], dayStart: number, dayEnd: number): Slot[] {
  const out: Slot[] = [];
  let cursor = dayStart;
  const sorted = busy.slice().sort((a, b) => a.startMs - b.startMs);
  for (const s of sorted) {
    if (s.startMs > cursor) out.push({ startMs: cursor, endMs: Math.min(s.startMs, dayEnd) });
    cursor = Math.max(cursor, s.endMs);
    if (cursor >= dayEnd) break;
  }
  if (cursor < dayEnd) out.push({ startMs: cursor, endMs: dayEnd });
  return out.filter(s => s.endMs - s.startMs > 0);
}

export function pickSlots(free: Slot[], cfg: CalConfig, constraints: AvailConstraints): Slot[] {
  const desiredDur = constraints.durationMinOverride ?? cfg.durationMin;
  const step = cfg.slotIncrementMin;
  const options: Slot[] = [];

  const nowPlusNotice = Date.now() + cfg.minNoticeMin * 60 * 1000;

  const withinPart = (ms: number) => {
    const h = new Date(ms).getHours();
    if (constraints.dayPart === 'morning') return h < 12;
    if (constraints.dayPart === 'afternoon') return h >= 12 && h < 17;
    if (constraints.dayPart === 'evening') return h >= 17 && h <= 20;
    return true;
  };

  for (const f of free) {
    let s = f.startMs;
    while (s + desiredDur * 60 * 1000 <= f.endMs) {
      const e = s + desiredDur * 60 * 1000;
      if (s >= nowPlusNotice && withinPart(s)) {
        options.push({ startMs: s, endMs: e });
        if (options.length >= cfg.suggestCount) return options;
      }
      s = addMinutes(s, step);
    }
  }

  return options;
}

export function formatSlots(slots: Slot[], tz: string): Array<{ label: string }> {
  const fmtDate = new Intl.DateTimeFormat('en', { timeZone: tz, weekday: 'short', month: 'short', day: '2-digit' });
  const fmtTime = new Intl.DateTimeFormat('en', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  const zone = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'short' }).format(new Date()).split(' ').pop();

  return slots.map(s => {
    const d = fmtDate.format(new Date(s.startMs));
    const t1 = fmtTime.format(new Date(s.startMs));
    const t2 = fmtTime.format(new Date(s.endMs));
    return { label: `${d} · ${t1}–${t2} ${zone} (${tz})` };
  });
}

/** Core: suggest availability slots across next N days. */
export function suggestAvailability(busy: Slot[], cfg: CalConfig, constraints: AvailConstraints): Slot[] {
  const out: Slot[] = [];
  const today = Date.now();
  const tz = cfg.timezone;
  const bufferBusy = expandBusy(busy, cfg.bufferMin);

  for (let d = 0; d < cfg.lookaheadDays && out.length < cfg.suggestCount; d++) {
    const dayMs = startOfDayMs(today + d * 24 * 60 * 60 * 1000, tz);
    const dow = dayOfWeek(dayMs, tz);
    if (!cfg.workDays.includes(dow)) continue;

    if (constraints.onDate) {
      const iso = new Date(dayMs).toISOString().slice(0, 10);
      if (iso !== constraints.onDate) continue;
    }

    const dayStart = addMinutes(dayMs, cfg.workStartMin);
    const dayEnd = addMinutes(dayMs, cfg.workEndMin);

    const dayBusy = bufferBusy.filter(b => !(b.endMs <= dayStart || b.startMs >= dayEnd));
    const free = invertToFree(dayBusy, dayStart, dayEnd);
    const daySlots = pickSlots(free, cfg, constraints);
    out.push(...daySlots);
  }
  return out.slice(0, cfg.suggestCount);
}

