import { google } from 'googleapis';

export function gmailClientFromAccessToken(accessToken: string) {
  const auth = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    process.env.GMAIL_REDIRECT_URI
  );
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth });
}

export async function startWatch(accessToken: string) {
  const gmail = gmailClientFromAccessToken(accessToken);
  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: { topicName: process.env.GMAIL_PUBSUB_TOPIC!, labelIds: ['INBOX'] }
  });
  return res.data; // { historyId, expiration }
}

export async function getProfile(accessToken: string) {
  const gmail = gmailClientFromAccessToken(accessToken);
  const res = await gmail.users.getProfile({ userId: 'me' });
  return res.data; // { emailAddress, historyId, messagesTotal, threadsTotal }
}

export async function listHistory(accessToken: string, startHistoryId: string) {
  const gmail = gmailClientFromAccessToken(accessToken);
  let pageToken: string | undefined;
  const out: any[] = [];
  do {
    const res = await gmail.users.history.list({
      userId: 'me',
      startHistoryId,
      pageToken,
      historyTypes: ['messageAdded'],
      labelId: 'INBOX'
    });
    (res.data.history ?? []).forEach(h => out.push(h));
    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);
  return out;
}

export async function getMessage(accessToken: string, id: string) {
  const gmail = gmailClientFromAccessToken(accessToken);
  const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
  return res.data;
}
