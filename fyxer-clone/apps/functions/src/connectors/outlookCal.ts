const GRAPH = 'https://graph.microsoft.com/v1.0';

/** Returns busy intervals [startMs, endMs) via /me/calendarView */
export async function outlookBusy(token: string, timeMinISO: string, timeMaxISO: string, timezone: string): Promise<Array<[number, number]>> {
  const url = new URL(`${GRAPH}/me/calendarView`);
  url.searchParams.set('startDateTime', timeMinISO);
  url.searchParams.set('endDateTime', timeMaxISO);
  url.searchParams.set('$select', 'start,end,isAllDay,showAs');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Prefer: `outlook.timezone="${timezone}"` }
  });
  if (!res.ok) throw new Error(`Outlook calendarView failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { value: Array<{ start: { dateTime: string }, end: { dateTime: string }, isAllDay?: boolean, showAs?: string }> };
  const busy: Array<[number, number]> = [];
  for (const ev of (data.value || [])) {
    const start = Date.parse(ev.start?.dateTime || '');
    const end = Date.parse(ev.end?.dateTime || '');
    const status = (ev.showAs || 'busy').toLowerCase();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && status !== 'free') {
      busy.push([start, end]);
    }
  }
  return busy;
}

