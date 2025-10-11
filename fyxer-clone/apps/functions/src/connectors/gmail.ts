import { google } from 'googleapis';
import { PubSub } from '@google-cloud/pubsub';
import { env } from '../env';

const pubsub = new PubSub();

export function gmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: 'v1', auth });
}

export async function startWatch(accessToken: string, user: string) {
  const gmail = gmailClient(accessToken);
  const res = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: env.GMAIL_PUBSUB_TOPIC,
      labelIds: ['INBOX']
    }
  });
  return res.data; // contains historyId and expiration
}

export async function listHistory(accessToken: string, startHistoryId: string) {
  const gmail = gmailClient(accessToken);
  const res = await gmail.users.history.list({ userId: 'me', startHistoryId });
  return res.data.history ?? [];
}

export async function getMessage(accessToken: string, id: string) {
  const gmail = gmailClient(accessToken);
  const res = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
  return res.data;
}

