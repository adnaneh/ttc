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

