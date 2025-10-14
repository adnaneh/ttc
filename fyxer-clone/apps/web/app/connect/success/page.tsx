import Link from 'next/link';
import { Button } from '@/components/ui/button';

type Props = {
  searchParams?: { provider?: string; email?: string };
};

export default function ConnectSuccessPage({ searchParams }: Props) {
  const provider = (searchParams?.provider || 'account').toLowerCase();
  const email = searchParams?.email;
  const prettyProvider = provider === 'gmail'
    ? 'Gmail'
    : provider === 'outlook'
    ? 'Outlook'
    : 'Account';

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">Connection successful</h1>
      <p className="mt-2 text-sm opacity-80">
        {prettyProvider} {email ? `(${email})` : ''} is now connected.
      </p>

      <div className="mt-6 flex gap-3">
        <Link href="/">
          <Button>Go to dashboard</Button>
        </Link>
        <Link href="/connect">
          <Button variant="ghost">Connect another</Button>
        </Link>
      </div>
    </main>
  );
}

