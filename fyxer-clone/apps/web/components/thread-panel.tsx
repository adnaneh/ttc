'use client';
import { useState } from 'react';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';

export function ThreadPanel({ threadId }: { threadId: string }) {
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<'idle'|'loading'|'done'>('idle');

  async function onDraft() {
    setStatus('loading');
    const res = await fetch('/api/agent', { method: 'POST', body: JSON.stringify({ userId: 'demo', threadId, action: 'draft' }) });
    const data = await res.json();
    setDraft(data.text || '<p>Draft generated.</p>');
    setStatus('done');
  }

  return (
    <div className="space-y-3">
      <Button onClick={onDraft} disabled={status==='loading'}>{status==='loading' ? 'Drafting...' : 'Draft reply'}</Button>
      <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={10} />
    </div>
  );
}

