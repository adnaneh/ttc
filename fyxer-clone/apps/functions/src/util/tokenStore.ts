import { google } from 'googleapis';
import { db } from './firestore';
import { decryptToken, encryptToken } from './kms';
import { env } from '../env';

// ---------- Gmail ----------

export function gmailOAuthClient() {
  return new google.auth.OAuth2(env.GMAIL_CLIENT_ID, env.GMAIL_CLIENT_SECRET, env.GMAIL_REDIRECT_URI);
}

export async function saveGmailTokens(mailboxRefPath: string, tokens: any) {
  const doc = db.collection('tokens').doc();
  const encrypted = await encryptToken(JSON.stringify(tokens));
  await doc.set({
    provider: 'gmail',
    mailboxRef: mailboxRefPath,
    encrypted,
    createdAt: Date.now()
  });
  return doc.path;
}

export async function getFreshAccessTokenForMailbox(mailboxRefPath: string): Promise<string> {
  // Gmail refresh
  const tokenObj = await getTokensByMailboxRef(mailboxRefPath);
  if (!tokenObj?.refresh_token) throw new Error('Missing refresh token');
  const oauth = gmailOAuthClient();
  oauth.setCredentials({ refresh_token: tokenObj.refresh_token });
  const { credentials } = await oauth.refreshAccessToken();
  return credentials.access_token!;
}

export async function getMailboxByEmail(email: string) {
  const q = await db.collection('mailboxes')
    .where('type', '==', 'gmail')
    .where('providerUserId', '==', email)
    .limit(1).get();
  return q.empty ? null : { id: q.docs[0].id, ref: q.docs[0].ref, data: q.docs[0].data() as any };
}

// ---------- Outlook / Microsoft Graph ----------

const AUTH_BASE = (tenant: string) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;

export function outlookAuthUrl(stateId: string) {
  const params = new URLSearchParams({
    client_id: env.MS_CLIENT_ID,
    response_type: 'code',
    redirect_uri: env.MS_REDIRECT_URI,
    response_mode: 'query',
    scope: 'offline_access Mail.Read Mail.ReadWrite User.Read',
    state: stateId
  });
  return `${AUTH_BASE(env.MS_TENANT)}/authorize?${params.toString()}`;
}

export async function outlookExchangeCode(code: string) {
  const body = new URLSearchParams({
    client_id: env.MS_CLIENT_ID,
    client_secret: env.MS_CLIENT_SECRET,
    code,
    redirect_uri: env.MS_REDIRECT_URI,
    grant_type: 'authorization_code'
  });
  const res = await fetch(`${AUTH_BASE(env.MS_TENANT)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}

export async function outlookRefreshToken(refresh_token: string) {
  const body = new URLSearchParams({
    client_id: env.MS_CLIENT_ID,
    client_secret: env.MS_CLIENT_SECRET,
    refresh_token,
    redirect_uri: env.MS_REDIRECT_URI,
    grant_type: 'refresh_token'
  });
  const res = await fetch(`${AUTH_BASE(env.MS_TENANT)}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });
  if (!res.ok) throw new Error(`Refresh failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function saveOutlookTokens(mailboxRefPath: string, tokens: any) {
  const doc = db.collection('tokens').doc();
  const encrypted = await encryptToken(JSON.stringify(tokens));
  await doc.set({
    provider: 'outlook',
    mailboxRef: mailboxRefPath,
    encrypted,
    createdAt: Date.now()
  });
  return doc.path;
}

export async function getFreshGraphAccessTokenForMailbox(mailboxRefPath: string): Promise<string> {
  const tokenObj = await getTokensByMailboxRef(mailboxRefPath);
  if (!tokenObj?.refresh_token) throw new Error('Missing refresh token (Graph)');
  const { access_token, refresh_token } = await outlookRefreshToken(tokenObj.refresh_token);
  // Persist new refresh_token if it rotates
  if (refresh_token && refresh_token !== tokenObj.refresh_token) {
    const q = await db.collection('tokens').where('mailboxRef', '==', mailboxRefPath).limit(1).get();
    if (!q.empty) {
      const encrypted = await encryptToken(JSON.stringify({ ...tokenObj, refresh_token }));
      await q.docs[0].ref.update({ encrypted, updatedAt: Date.now() });
    }
  }
  return access_token;
}

export async function getTokensByMailboxRef(mailboxRefPath: string) {
  const q = await db.collection('tokens').where('mailboxRef', '==', mailboxRefPath).limit(1).get();
  if (q.empty) return null;
  const enc = q.docs[0].data().encrypted as string;
  const raw = await decryptToken(enc);
  return JSON.parse(raw);
}
