import Link from 'next/link';
import { Button } from '@/components/ui/button';

type Props = {
  searchParams?: Promise<{ provider?: string; email?: string }>;
};

export default async function ConnectSuccessPage({ searchParams }: Props) {
  const sp = await searchParams;
  const provider = (sp?.provider || 'account').toLowerCase();
  const email = sp?.email;
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
