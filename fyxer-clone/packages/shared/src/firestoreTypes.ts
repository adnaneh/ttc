import { Provider, TaskType } from './constants';

export interface Org { name: string; createdAt: number; plan: 'free'|'pro'|'enterprise'; }
export interface User { orgId: string; email: string; displayName?: string; createdAt: number; }

export interface Mailbox {
  orgId: string;
  userId: string;
  type: Provider;
  providerUserId: string;
  scopes: string[];
  tokenRef: string; // /tokens/{id}
  sync: { cursor?: string; watchExpiration?: number };
  createdAt: number;
}

export interface Thread {
  orgId: string; mailboxRef: string;
  providerThreadId: string;
  participants: string[];
  subject: string;
  labels: string[];
  lastMessageAt: number;
  state: 'needs_reply'|'waiting'|'done';
  createdAt: number;
}

export interface Message {
  threadRef: string;
  providerMsgId: string;
  from: string;
  to: string[]; cc?: string[]; bcc?: string[];
  snippet?: string;
  bodyPtr: string; // gs://...
  attachments?: Array<{ filename: string; size: number; ptr: string }>;
  sentAt: number;
  isInbound: boolean;
  analysis?: { intent?: string; urgency?: 'low'|'med'|'high' };
}

export interface Draft {
  threadRef: string; messageRef?: string;
  model: string; promptCtx?: string;
  htmlBody: string;
  status: 'proposed'|'accepted'|'sent'|'rejected';
  createdAt: number;
}

export interface Task {
  type: TaskType;
  dueAt: number; status: 'todo'|'doing'|'done'|'error';
  resultPtr?: string; // gs://...
  createdAt: number;
}

export interface VectorChunk {
  mailboxRef: string;
  source: 'email'|'meeting'|'doc';
  vectorId: string;
  metadata: Record<string, any>;
}

export interface Token {
  provider: Provider;
  mailboxRef: string;
  encrypted: string; // KMS wrapped
  createdAt: number;
}

