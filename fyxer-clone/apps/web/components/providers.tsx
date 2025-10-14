'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import posthog from 'posthog-js';
import { useEffect, useState } from 'react';
import { env } from '../lib/env';

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  useEffect(() => {
    if (env.NEXT_PUBLIC_POSTHOG_KEY) {
      posthog.init(env.NEXT_PUBLIC_POSTHOG_KEY, { person_profiles: 'identified_only' });
    }
  }, []);
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
