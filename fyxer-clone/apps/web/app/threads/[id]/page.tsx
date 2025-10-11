import { ThreadPanel } from '@/components/thread-panel';

export default function ThreadPage({ params }: { params: { id: string }}) {
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h2 className="text-xl font-semibold">Thread {params.id}</h2>
      <ThreadPanel threadId={params.id} />
    </main>
  );
}

