import Link from 'next/link';

export default function Page() {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Inbox Assistant</h1>
      <p className="text-sm opacity-80">Connect Gmail/Outlook and triage faster.</p>
      <div className="mt-6 space-x-3">
        <Link className="underline" href="/test/invoice">Test: Invoice Extractor</Link>
      </div>
    </main>
  );
}
