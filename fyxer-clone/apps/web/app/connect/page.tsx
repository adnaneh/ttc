'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export default function ConnectPage() {
  const [loading, setLoading] = useState(false);

  async function connectGmail() {
    setLoading(true);
    try {
      // This route proxies to the HTTPS Function start URL
      const res = await fetch('/api/connect/gmail/start');
      const { url } = await res.json();
      window.location.href = url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Connect your inbox</h1>
      <p className="mt-2 text-sm opacity-80">Gmail first. Outlook next.</p>
      <div className="mt-6">
        <Button onClick={connectGmail} disabled={loading}>
          {loading ? 'Redirecting…' : 'Connect Gmail'}
        </Button>
      </div>
    </main>
  );
}

