import { db } from './firestore';

export type CalConfig = {
  timezone: string;
  workDays: number[];         // 1=Mon ... 7=Sun
  workStartMin: number;       // minutes from 00:00
  workEndMin: number;         // minutes from 00:00
  durationMin: number;
  slotIncrementMin: number;
  lookaheadDays: number;
  bufferMin: number;
  minNoticeMin: number;
  suggestCount: number;
};

function parseDays(spec: string): number[] {
  const map: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
  const parts = (spec || '').split(',').map(s => s.trim());
  const out = new Set<number>();
  for (const p of parts) {
    if (!p) continue;
    if (p.includes('-')) {
      const [a, b] = p.split('-').map(s => s.trim().slice(0, 3).toLowerCase());
      const ia = map[a], ib = map[b];
      if (ia && ib) {
        if (ia <= ib) { for (let d = ia; d <= ib; d++) out.add(d); }
        else { for (let d = ia; d <= 7; d++) out.add(d); for (let d = 1; d <= ib; d++) out.add(d); }
      }
    } else {
      const k = p.slice(0, 3).toLowerCase();
      if (map[k]) out.add(map[k]);
    }
  }
  return Array.from(out).sort((a, b) => a - b);
}

function parseHm(hm?: string): number {
  if (!hm) return 9 * 60;
  const m = hm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 9 * 60;
  return Number(m[1]) * 60 + Number(m[2]);
}

export async function getOrgCalendarConfig(orgId: string): Promise<CalConfig> {
  const snap = await db.collection('orgs').doc(orgId).collection('calendar').doc('settings').get();
  const d = snap.exists ? (snap.data() as any) : {};

  const env = process.env;
  const tzDefault = env.AVAIL_TZ_DEFAULT || 'UTC';
  const workDaysSpec = env.AVAIL_WORK_DAYS || 'Mon-Fri';

  const timezone = d.timezone || tzDefault;
  const workDays = Array.isArray(d.workDays) && d.workDays.length ? d.workDays : parseDays(d.workDaysSpec || workDaysSpec);
  return {
    timezone,
    workDays,
    workStartMin: parseHm(d.workStart || env.AVAIL_WORK_START || '09:00'),
    workEndMin: parseHm(d.workEnd || env.AVAIL_WORK_END || '17:30'),
    durationMin: Number(d.durationMin ?? env.AVAIL_DURATION_MIN ?? '30'),
    slotIncrementMin: Number(d.slotIncrementMin ?? env.AVAIL_SLOT_INCREMENT_MIN ?? '30'),
    lookaheadDays: Number(d.lookaheadDays ?? env.AVAIL_LOOKAHEAD_DAYS ?? '10'),
    bufferMin: Number(d.bufferMin ?? env.AVAIL_BUFFER_MIN ?? '15'),
    minNoticeMin: Number(d.minNoticeMin ?? env.AVAIL_MIN_NOTICE_MIN ?? '120'),
    suggestCount: Number(d.suggestCount ?? env.AVAIL_SUGGEST_COUNT ?? '3')
  };
}

