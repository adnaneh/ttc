import { db } from './firestore';

function envBool(name: string, fallback: boolean) {
  const v = String(process.env[name] ?? '').toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

/**
 * Read org-level feature toggle. If missing, fallback to process.env default.
 * org doc example: { features: { llmParseQuotes: true } }
 */
export async function orgFeature(orgId: string, key: 'llmParseQuotes', fallback?: boolean): Promise<boolean> {
  const snap = await db.collection('orgs').doc(orgId).get();
  const org = snap.exists ? (snap.data() as any) : undefined;
  const val = org?.features?.[key];
  if (typeof val === 'boolean') return val;
  if (key === 'llmParseQuotes') return envBool('QUOTE_LLM_PARSE_DEFAULT', fallback ?? false);
  return !!fallback;
}

