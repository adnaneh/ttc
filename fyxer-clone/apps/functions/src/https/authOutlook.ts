import { onRequest } from 'firebase-functions/v2/https';
import { db } from '../util/firestore';
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
  if (!code || !stateId) { res.status(400).send('Missing code or state'); return; }

  const stateSnap = await db.collection('oauthStates').doc(stateId).get();
  if (!stateSnap.exists) { res.status(400).send('Invalid state'); return; }
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
    sync: {
      inbox: { deltaLink: '', subscriptionId: '', watchExpiration: 0 },
      sent:  { deltaLink: '', subscriptionId: '', watchExpiration: 0 }
    },
    createdAt: Date.now()
  });

  const tokenRefPath = await saveOutlookTokens(mailboxRef.path, tokens);
  await mailboxRef.update({ tokenRef: tokenRefPath });

  const expires = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  const inboxSub = await createSubscription(tokens.access_token, process.env.GRAPH_WEBHOOK_URL!, expires(1), 'Inbox');
  const sentSub  = await createSubscription(tokens.access_token, process.env.GRAPH_WEBHOOK_URL!, expires(1), 'SentItems');

  await mailboxRef.update({
    'sync.inbox.subscriptionId': inboxSub.id,
    'sync.inbox.watchExpiration': Date.parse(inboxSub.expirationDateTime),
    'sync.sent.subscriptionId': sentSub.id,
    'sync.sent.watchExpiration': Date.parse(sentSub.expirationDateTime)
  });

  // Initialize delta links for both folders (without backfill)
  const fresh = await getFreshGraphAccessTokenForMailbox(mailboxRef.path);
  let p = await messagesDelta(fresh, undefined, 'Inbox');
  while (p['@odata.nextLink']) p = await messagesDelta(fresh, p['@odata.nextLink'], 'Inbox');
  await mailboxRef.update({ 'sync.inbox.deltaLink': p['@odata.deltaLink'] || '' });

  let q = await messagesDelta(fresh, undefined, 'SentItems');
  while (q['@odata.nextLink']) q = await messagesDelta(fresh, q['@odata.nextLink'], 'SentItems');
  await mailboxRef.update({ 'sync.sent.deltaLink': q['@odata.deltaLink'] || '' });

  await stateSnap.ref.delete().catch(() => {});

  const back = ensureUrl(process.env.OAUTH_SUCCESS_REDIRECT) ?? 'https://example.com/connected';
  res.redirect(302, `${back}?provider=outlook&email=${encodeURIComponent(email)}`);
  return;
});
