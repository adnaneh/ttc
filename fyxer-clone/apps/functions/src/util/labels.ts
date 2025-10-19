import { db, FieldValue } from './firestore';
import { gmailClientFromAccessToken } from '../connectors/gmail';

export const LABELS = {
  INCOHERENCE: 'incoherence',
  TO_RESPOND: 'to respond',
  FYI: 'FYI',
  ACTIONED: 'actioned',
  SPOT_RATE: 'spot rate requests'
} as const;

type Provider = 'gmail' | 'outlook';

// ---------- Firestore mirror ----------
export async function addThreadLabelFirestore(threadId: string, label: string) {
  // Ensure doc exists and add label via arrayUnion
  await db.collection('threads').doc(threadId).set({ labels: [] }, { merge: true });
  await db.collection('threads').doc(threadId).update({
    labels: FieldValue.arrayUnion(label)
  } as any).catch(() => {});
}

// ---------- Gmail labels ----------
async function ensureGmailLabel(accessToken: string, mailboxId: string, name: string): Promise<string> {
  const mapDoc = db.collection('mailboxes').doc(mailboxId).collection('metadata').doc('gmailLabels');
  const cached = await mapDoc.get();
  const localMap: Record<string, string> = cached.exists ? ((cached.data() as any) || {}) : {};

  if (localMap[name]) return localMap[name];

  const gmail = gmailClientFromAccessToken(accessToken);

  const res = await gmail.users.labels.list({ userId: 'me' });
  const hit = (res.data.labels || []).find(l => l.name === name);
  if (hit?.id) {
    await mapDoc.set({ [name]: hit.id }, { merge: true });
    return hit.id;
  }

  // create
  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name, labelListVisibility: 'labelShow', messageListVisibility: 'show' }
  });
  const id = created.data.id!;
  await mapDoc.set({ [name]: id }, { merge: true });
  return id;
}

export async function addGmailThreadLabel(accessToken: string, mailboxId: string, threadId: string, labelName: string) {
  const id = await ensureGmailLabel(accessToken, mailboxId, labelName);
  const gmail = gmailClientFromAccessToken(accessToken);
  await gmail.users.threads.modify({
    userId: 'me',
    id: threadId,
    requestBody: { addLabelIds: [id] }
  });
}

// ---------- Outlook categories ----------
const GRAPH = 'https://graph.microsoft.com/v1.0';

async function ensureOutlookCategory(accessToken: string, mailboxId: string, name: string) {
  const mapDoc = db.collection('mailboxes').doc(mailboxId).collection('metadata').doc('outlookCategories');
  const cached = await mapDoc.get();
  const localMap: Record<string, boolean> = cached.exists ? ((cached.data() as any) || {}) : {};
  if (localMap[name]) return;

  // list existing
  const list = await fetch(`${GRAPH}/me/outlook/masterCategories`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (list.ok) {
    const data = await list.json() as { value: Array<{ displayName: string }> };
    if (data.value?.some(c => c.displayName === name)) {
      await mapDoc.set({ [name]: true }, { merge: true });
      return;
    }
  }

  // create – Outlook requires a preset color
  const create = await fetch(`${GRAPH}/me/outlook/masterCategories`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: name, color: 'preset0' })
  });
  if (!create.ok) throw new Error(`Create category failed: ${create.status} ${await create.text()}`);
  await mapDoc.set({ [name]: true }, { merge: true });
}

export async function addOutlookMessageCategory(accessToken: string, mailboxId: string, messageId: string, name: string) {
  await ensureOutlookCategory(accessToken, mailboxId, name);
  const res = await fetch(`${GRAPH}/me/messages/${messageId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories: [name] })
  });
  if (!res.ok) throw new Error(`Set category failed: ${res.status} ${await res.text()}`);
}

// ---------- Facade ----------
export async function applyLabel(params: {
  provider: Provider;
  token: string;
  mailboxId: string;
  threadId: string;
  messageId: string;
  label: keyof typeof LABELS;
}) {
  const name = LABELS[params.label];
  if (params.provider === 'gmail') {
    await addGmailThreadLabel(params.token, params.mailboxId, params.threadId, name);
  } else {
    await addOutlookMessageCategory(params.token, params.mailboxId, params.messageId, name);
  }
  await addThreadLabelFirestore(params.threadId, name);
}

