import { db } from './firestore';
import { gmailClientFromAccessToken } from '../connectors/gmail';

export type LabelKey = 'INCOHERENCE'|'TO_RESPOND'|'FYI'|'ACTIONED'|'SPOT_RATE';
type Provider = 'gmail'|'outlook';

const TRIAGE_KEYS: LabelKey[] = ['TO_RESPOND','FYI','ACTIONED'];

export const LABEL_META: Record<LabelKey, {
  name: string,
  gmailColor: { backgroundColor: string, textColor: string },
  outlookColor: string
}> = {
  INCOHERENCE: { name: '0: incoherence', gmailColor: { backgroundColor: '#d93025', textColor: '#ffffff' }, outlookColor: 'preset3' },
  TO_RESPOND:  { name: '1: to respond', gmailColor: { backgroundColor: '#f29900', textColor: '#ffffff' }, outlookColor: 'preset7' },
  FYI:         { name: '2: FYI',        gmailColor: { backgroundColor: '#1a73e8', textColor: '#ffffff' }, outlookColor: 'preset1' },
  ACTIONED:    { name: '3: actioned',   gmailColor: { backgroundColor: '#188038', textColor: '#ffffff' }, outlookColor: 'preset10' },
  SPOT_RATE:   { name: '4: spot rate requests', gmailColor: { backgroundColor: '#9334e6', textColor: '#ffffff' }, outlookColor: 'preset5' }
};

// ---------------- Firestore helpers ----------------
function triageNames(): string[] { return TRIAGE_KEYS.map(k => LABEL_META[k].name); }

async function setThreadTriageLabelFirestore(threadId: string, targetName: string) {
  const ref = db.collection('threads').doc(threadId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const labels: string[] = (snap.exists && Array.isArray((snap.data() as any)?.labels))
      ? (snap.data() as any).labels
      : [];
    const next = labels.filter(l => !triageNames().includes(l));
    if (!next.includes(targetName)) next.push(targetName);
    tx.set(ref, { labels: next }, { merge: true });
  });
}

async function addThreadPersistentLabelFirestore(threadId: string, name: string) {
  const ref = db.collection('threads').doc(threadId);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const labels: string[] = (snap.exists && Array.isArray((snap.data() as any)?.labels))
      ? (snap.data() as any).labels
      : [];
    const set = new Set<string>(labels);
    set.add(name);
    tx.set(ref, { labels: Array.from(set) }, { merge: true });
  });
}

// ---------------- Gmail labels ----------------
async function ensureGmailLabelByKey(token: string, mailboxId: string, key: LabelKey): Promise<string> {
  const meta = LABEL_META[key];
  const mapDoc = db.collection('mailboxes').doc(mailboxId).collection('metadata').doc('gmailLabelsByKey');
  const mapSnap = await mapDoc.get();
  const map = (mapSnap.exists ? (mapSnap.data() as any) : {}) as Record<LabelKey, { id: string, name: string } | undefined>;

  const gmail = gmailClientFromAccessToken(token);

  const existing = map[key];
  if (existing?.id) {
    try {
      const cur = await gmail.users.labels.get({ userId: 'me', id: existing.id });
      const needRename = cur.data.name !== meta.name;
      const needColor = JSON.stringify(cur.data.color || {}) !== JSON.stringify(meta.gmailColor);
      if (needRename || needColor) {
        await gmail.users.labels.update({
          userId: 'me',
          id: existing.id,
          requestBody: { name: meta.name, color: meta.gmailColor, labelListVisibility: 'labelShow', messageListVisibility: 'show' }
        });
      }
      if (existing.name !== meta.name) await mapDoc.set({ [key]: { id: existing.id, name: meta.name } }, { merge: true });
      return existing.id;
    } catch {
      // fall through to re-create
    }
  }

  const all = await gmail.users.labels.list({ userId: 'me' });
  const hit = (all.data.labels || []).find(l => l.name === meta.name);
  if (hit?.id) {
    await mapDoc.set({ [key]: { id: hit.id, name: meta.name } }, { merge: true });
    return hit.id;
  }

  const created = await gmail.users.labels.create({
    userId: 'me',
    requestBody: { name: meta.name, color: meta.gmailColor, labelListVisibility: 'labelShow', messageListVisibility: 'show' }
  });
  const id = created.data.id!;
  await mapDoc.set({ [key]: { id, name: meta.name } }, { merge: true });
  return id;
}

async function gmailSetTriageExclusive(token: string, mailboxId: string, threadId: string, key: LabelKey) {
  if (!TRIAGE_KEYS.includes(key)) throw new Error('gmailSetTriageExclusive: key must be triage');
  const gmail = gmailClientFromAccessToken(token);
  const addId = await ensureGmailLabelByKey(token, mailboxId, key);
  const removeIds = await Promise.all(TRIAGE_KEYS.filter(k => k !== key).map(k => ensureGmailLabelByKey(token, mailboxId, k)));
  await gmail.users.threads.modify({ userId: 'me', id: threadId, requestBody: { addLabelIds: [addId], removeLabelIds: removeIds } });
  await setThreadTriageLabelFirestore(threadId, LABEL_META[key].name);
}

async function gmailAddPersistent(token: string, mailboxId: string, threadId: string, key: LabelKey) {
  const id = await ensureGmailLabelByKey(token, mailboxId, key);
  const gmail = gmailClientFromAccessToken(token);
  await gmail.users.threads.modify({ userId: 'me', id: threadId, requestBody: { addLabelIds: [id] } });
  await addThreadPersistentLabelFirestore(threadId, LABEL_META[key].name);
}

// ---------------- Outlook categories ----------------
const GRAPH = 'https://graph.microsoft.com/v1.0';

async function ensureOutlookCategoryByKey(token: string, mailboxId: string, key: LabelKey): Promise<string> {
  const meta = LABEL_META[key];
  const mapDoc = db.collection('mailboxes').doc(mailboxId).collection('metadata').doc('outlookCategoriesByKey');
  const mapSnap = await mapDoc.get();
  const map = (mapSnap.exists ? (mapSnap.data() as any) : {}) as Record<LabelKey, { id: string, name: string } | undefined>;

  const list = await fetch(`${GRAPH}/me/outlook/masterCategories`, { headers: { Authorization: `Bearer ${token}` } });
  if (!list.ok) throw new Error(`List categories failed: ${list.status} ${await list.text()}`);
  const data = await list.json() as { value: Array<{ id: string, displayName: string, color: string }> };

  const existing = map[key];
  if (existing?.id) {
    const cat = data.value.find(c => c.id === existing.id);
    if (cat) {
      if (cat.displayName !== meta.name || cat.color !== meta.outlookColor) {
        const patch = await fetch(`${GRAPH}/me/outlook/masterCategories/${existing.id}`, {
          method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: meta.name, color: meta.outlookColor })
        });
        if (!patch.ok) throw new Error(`Update category failed: ${patch.status} ${await patch.text()}`);
      }
      if (existing.name !== meta.name) await mapDoc.set({ [key]: { id: existing.id, name: meta.name } }, { merge: true });
      return existing.id;
    }
  }

  const hit = data.value.find(c => c.displayName === meta.name);
  if (hit) { await mapDoc.set({ [key]: { id: hit.id, name: meta.name } }, { merge: true }); return hit.id; }

  const create = await fetch(`${GRAPH}/me/outlook/masterCategories`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName: meta.name, color: meta.outlookColor })
  });
  if (!create.ok) throw new Error(`Create category failed: ${create.status} ${await create.text()}`);
  const created = await create.json() as { id: string };
  await mapDoc.set({ [key]: { id: created.id, name: meta.name } }, { merge: true });
  return created.id;
}

async function outlookGetMessageCategories(token: string, messageId: string): Promise<string[]> {
  const res = await fetch(`${GRAPH}/me/messages/${messageId}?$select=categories`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Get message failed: ${res.status} ${await res.text()}`);
  const j = await res.json();
  return (j.categories || []) as string[];
}

async function outlookSetTriageExclusive(token: string, mailboxId: string, threadId: string, messageId: string, key: LabelKey) {
  if (!TRIAGE_KEYS.includes(key)) throw new Error('outlookSetTriageExclusive: key must be triage');
  await ensureOutlookCategoryByKey(token, mailboxId, key);
  for (const k of TRIAGE_KEYS.filter(k => k !== key)) await ensureOutlookCategoryByKey(token, mailboxId, k);

  const current = await outlookGetMessageCategories(token, messageId);
  const triage = triageNames();
  const kept = current.filter(c => !triage.includes(c));
  const next = Array.from(new Set([...kept, LABEL_META[key].name]));
  const patch = await fetch(`${GRAPH}/me/messages/${messageId}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories: next })
  });
  if (!patch.ok) throw new Error(`Patch message categories failed: ${patch.status} ${await patch.text()}`);
  await setThreadTriageLabelFirestore(threadId, LABEL_META[key].name);
}

async function outlookAddPersistent(token: string, mailboxId: string, threadId: string, messageId: string, key: LabelKey) {
  await ensureOutlookCategoryByKey(token, mailboxId, key);
  const current = await outlookGetMessageCategories(token, messageId);
  const next = Array.from(new Set([...current, LABEL_META[key].name]));
  const patch = await fetch(`${GRAPH}/me/messages/${messageId}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories: next })
  });
  if (!patch.ok) throw new Error(`Patch categories failed: ${patch.status} ${await patch.text()}`);
  await addThreadPersistentLabelFirestore(threadId, LABEL_META[key].name);
}

// ---------------- Public API ----------------
export async function setTriageLabelExclusive(params: {
  provider: Provider; token: string; mailboxId: string;
  threadId: string; messageId: string; key: 'TO_RESPOND'|'FYI'|'ACTIONED';
}) {
  if (params.provider === 'gmail') {
    await gmailSetTriageExclusive(params.token, params.mailboxId, params.threadId, params.key);
  } else {
    await outlookSetTriageExclusive(params.token, params.mailboxId, params.threadId, params.messageId, params.key);
  }
}

export async function addPersistentLabel(params: {
  provider: Provider; token: string; mailboxId: string;
  threadId: string; messageId: string; key: 'INCOHERENCE'|'SPOT_RATE';
}) {
  if (params.provider === 'gmail') {
    await gmailAddPersistent(params.token, params.mailboxId, params.threadId, params.key);
  } else {
    await outlookAddPersistent(params.token, params.mailboxId, params.threadId, params.messageId, params.key);
  }
}
