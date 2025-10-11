import { onRequest } from 'firebase-functions/v2/https';
import { db } from '../util/firestore';
import { env } from '../env';
import { gmailOAuthClient, saveGmailTokens } from '../util/tokenStore';
import { getProfile, startWatch } from '../connectors/gmail';

function ensureUrl(u?: string) { return u && /^https?:\/\//.test(u) ? u : undefined; }

export const authGmailStart = onRequest(async (req, res) => {
  const userId = (req.query.userId as string) || 'demo-user'; // attach Firebase UID in production
  const stateDoc = db.collection('oauthStates').doc();
  await stateDoc.set({ userId, createdAt: Date.now(), provider: 'gmail' });

  const oauth = gmailOAuthClient();
  const scopes = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/userinfo.email'
  ];
  const url = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes,
    // Encode state with ref id only; we look it up server-side
    state: stateDoc.id,
    include_granted_scopes: true
  });

  res.redirect(302, url);
});

export const authGmailCallback = onRequest(async (req, res) => {
  const code = req.query.code as string | undefined;
  const stateId = req.query.state as string | undefined;
  if (!code || !stateId) return res.status(400).send('Missing code or state');

  const stateSnap = await db.collection('oauthStates').doc(stateId).get();
  if (!stateSnap.exists) return res.status(400).send('Invalid state');
  const state = stateSnap.data() as { userId: string };

  const oauth = gmailOAuthClient();
  const { tokens } = await oauth.getToken(code);
  oauth.setCredentials(tokens);

  // Identify Gmail account
  const prof = await getProfile(tokens.access_token!);
  if (!prof.emailAddress) return res.status(400).send('Failed to fetch Gmail profile');

  // Create mailbox doc
  const mailboxRef = db.collection('mailboxes').doc();
  await mailboxRef.set({
    orgId: 'default', // in production, derive from user/org model
    userId: state.userId,
    type: 'gmail',
    providerUserId: prof.emailAddress,
    scopes: ['gmail.modify', 'userinfo.email'],
    tokenRef: '',
    sync: { cursor: String(prof.historyId ?? ''), watchExpiration: 0 },
    createdAt: Date.now()
  });

  // Persist tokens (encrypted) -> update mailbox with tokenRef
  const tokenRefPath = await saveGmailTokens(mailboxRef.path, tokens);
  await mailboxRef.update({ tokenRef: tokenRefPath });

  // Start watch now so future deltas come via Pub/Sub
  const watch = await startWatch(tokens.access_token!);
  await mailboxRef.update({
    'sync.cursor': String(watch.historyId ?? prof.historyId ?? ''),
    'sync.watchExpiration': Number(watch.expiration ?? 0)
  });

  // Cleanup state
  await stateSnap.ref.delete().catch(() => { /* ignore */ });

  // Redirect user back to frontend
  const back = ensureUrl(env.OAUTH_SUCCESS_REDIRECT) ?? 'https://example.com/connected';
  res.redirect(302, `${back}?provider=gmail&email=${encodeURIComponent(prof.emailAddress)}`);
});

