import { ThreadPanel } from '@/components/thread-panel';

export default async function ThreadPage({ params }: { params: Promise<{ id: string }>}) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h2 className="text-xl font-semibold">Thread {id}</h2>
      <ThreadPanel threadId={id} />
    </main>
  );
}
