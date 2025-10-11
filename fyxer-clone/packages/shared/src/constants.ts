export const COLL = {
  ORGS: 'orgs',
  USERS: 'users',
  MAILBOXES: 'mailboxes',
  THREADS: 'threads',
  MESSAGES: 'messages',
  DRAFTS: 'drafts',
  TASKS: 'tasks',
  MEETINGS: 'meetings',
  VECTORS: 'vectors',
  TOKENS: 'tokens',
  EVENTS: 'events'
} as const;

export type Provider = 'gmail' | 'outlook';
export type TaskType = 'followup' | 'summarize' | 'triage';

