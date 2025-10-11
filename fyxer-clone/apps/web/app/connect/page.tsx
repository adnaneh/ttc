'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function ConnectPage() {
  const [loadingG, setLoadingG] = useState(false);
  const [loadingO, setLoadingO] = useState(false);

  async function connect(provider: 'gmail'|'outlook') {
    const setter = provider === 'gmail' ? setLoadingG : setLoadingO;
    setter(true);
    try {
      const res = await fetch(`/api/connect/${provider}/start`);
      const { url } = await res.json();
      window.location.href = url;
    } finally {
      setter(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Connect your inbox</h1>
      <p className="mt-2 text-sm opacity-80">Gmail and Outlook supported.</p>
      <div className="mt-6 flex gap-3">
        <Button onClick={() => connect('gmail')} disabled={loadingG}> {loadingG ? 'Redirecting…' : 'Connect Gmail'} </Button>
        <Button onClick={() => connect('outlook')} disabled={loadingO}> {loadingO ? 'Redirecting…' : 'Connect Outlook'} </Button>
      </div>
    </main>
  );
}
