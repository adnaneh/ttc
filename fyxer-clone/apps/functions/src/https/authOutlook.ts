import { onRequest } from 'firebase-functions/v2/https';
import { db } from '../util/firestore';
import { env } from '../env';
import { outlookAuthUrl, outlookExchangeCode, saveOutlookTokens, getFreshGraphAccessTokenForMailbox } from '../util/tokenStore';
import { getMeProfile, createSubscription, messagesDelta } from '../connectors/outlook';

function ensureUrl(u?: string) { return u && /^https?:\/\//.test(u) ? u : undefined; }

export const authOutlookStart = onRequest(async (req, res) => {
  const userId = (req.query.userId as string) || 'demo-user';
  const stateDoc = db.collection('oauthStates').doc();
  await stateDoc.set({ userId, createdAt: Date.now(), provider: 'outlook' });
  const url = outlookAuthUrl(stateDoc.id);
  res.redirect(302, url);
});

export const authOutlookCallback = onRequest(async (req, res) => {
  const code = req.query.code as string | undefined;
  const stateId = req.query.state as string | undefined;
  if (!code || !stateId) return res.status(400).send('Missing code or state');

  const stateSnap = await db.collection('oauthStates').doc(stateId).get();
  if (!stateSnap.exists) return res.status(400).send('Invalid state');
  const state = stateSnap.data() as { userId: string };

  const tokens = await outlookExchangeCode(code);
  const profile = await getMeProfile(tokens.access_token);
  const email = profile.mail || profile.userPrincipalName;

  const mailboxRef = db.collection('mailboxes').doc();
  await mailboxRef.set({
    orgId: 'default',
    userId: state.userId,
    type: 'outlook',
    providerUserId: email,
    scopes: ['Mail.Read', 'Mail.ReadWrite', 'offline_access'],
    tokenRef: '',
    sync: { deltaLink: '', subscriptionId: '', watchExpiration: 0 },
    createdAt: Date.now()
  });

  const tokenRefPath = await saveOutlookTokens(mailboxRef.path, tokens);
  await mailboxRef.update({ tokenRef: tokenRefPath });

  // Create webhook subscription (short TTL is fine; cron renews)
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h
  const sub = await createSubscription(tokens.access_token, env.GRAPH_WEBHOOK_URL, expires);
  await mailboxRef.update({
    'sync.subscriptionId': sub.id,
    'sync.watchExpiration': Date.parse(sub.expirationDateTime)
  });

  // Initialize delta link without backfill (snapshot → deltaLink)
  const fresh = await getFreshGraphAccessTokenForMailbox(mailboxRef.path);
  let page = await messagesDelta(fresh);
  while (page['@odata.nextLink']) {
    page = await messagesDelta(fresh, page['@odata.nextLink']);
  }
  const deltaLink = page['@odata.deltaLink'];
  if (deltaLink) await mailboxRef.update({ 'sync.deltaLink': deltaLink });

  await stateSnap.ref.delete().catch(() => {});

  const back = ensureUrl(env.OAUTH_SUCCESS_REDIRECT) ?? 'https://example.com/connected';
  res.redirect(302, `${back}?provider=outlook&email=${encodeURIComponent(email)}`);
});

