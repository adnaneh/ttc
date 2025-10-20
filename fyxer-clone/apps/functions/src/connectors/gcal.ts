import { google } from 'googleapis';

function gcalClient(token: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: token });
  return google.calendar({ version: 'v3', auth });
}

/** Returns busy intervals [startMs, endMs) for primary calendar. */
export async function gcalBusyPrimary(token: string, timeMinISO: string, timeMaxISO: string): Promise<Array<[number, number]>> {
  const cal = gcalClient(token);
  const res = await cal.freebusy.query({
    requestBody: {
      timeMin: timeMinISO,
      timeMax: timeMaxISO,
      items: [{ id: 'primary' }]
    }
  });
  const periods = (res.data.calendars as any)?.primary?.busy || [];
  return periods.map((p: any) => [Date.parse(p.start), Date.parse(p.end)] as [number, number]);
}

