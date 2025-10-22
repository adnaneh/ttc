import { db } from './firestore';
import { bindCaseKey } from './procEvent';

export function caseIdFromQuote(quoteId: string) {
  return `Q:${quoteId}`;
}

export async function ensureCaseFromQuote(
  quoteId: string,
  threadId: string,
  orgId: string,
  extras?: Record<string, string>
) {
  const case_id = caseIdFromQuote(quoteId);
  await bindCaseKey({ case_id, key_type: 'quoteId', key_value: quoteId, source: 'system' });
  await bindCaseKey({ case_id, key_type: 'threadId', key_value: threadId, source: 'system' });
  for (const [k, v] of Object.entries(extras || {})) {
    if (v) await bindCaseKey({ case_id, key_type: k, key_value: v, source: 'system' });
  }

  await db.collection('procCases').doc(case_id).set({ orgId, quoteId, threadId, createdAt: Date.now() }, { merge: true });
  return case_id;
}

