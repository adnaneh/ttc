import { google } from 'googleapis';
import { db } from './firestore';
import { decryptToken, encryptToken } from './kms';
import { env } from '../env';

export async function saveGmailTokens(mailboxRefPath: string, tokens: any) {
  const coll = db.collection('tokens');
  const doc = coll.doc();
  const encrypted = await encryptToken(JSON.stringify(tokens));
  await doc.set({
    provider: 'gmail',
    mailboxRef: mailboxRefPath,
    encrypted,
    createdAt: Date.now()
  });
  return doc.path;
}

export async function getMailboxByEmail(email: string) {
  const q = await db.collection('mailboxes')
    .where('type', '==', 'gmail')
    .where('providerUserId', '==', email)
    .limit(1).get();
  return q.empty ? null : { id: q.docs[0].id, ref: q.docs[0].ref, data: q.docs[0].data() as any };
}

export async function getTokensByMailboxRef(mailboxRefPath: string) {
  const q = await db.collection('tokens').where('mailboxRef', '==', mailboxRefPath).limit(1).get();
  if (q.empty) return null;
  const enc = q.docs[0].data().encrypted as string;
  const raw = await decryptToken(enc);
  return JSON.parse(raw);
}

export function gmailOAuthClient() {
  return new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET, env.GMAIL_REDIRECT_URI);
}

export async function getFreshAccessTokenForMailbox(mailboxRefPath: string): Promise<string> {
  const tokenObj = await getTokensByMailboxRef(mailboxRefPath);
  if (!tokenObj?.refresh_token) throw new Error('Missing refresh token');
  const oauth = gmailOAuthClient();
  oauth.setCredentials({ refresh_token: tokenObj.refresh_token });
  const { credentials } = await oauth.refreshAccessToken();
  return credentials.access_token!;
}

