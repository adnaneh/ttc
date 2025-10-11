import { ThreadPanel } from '@/components/thread-panel';

export default function ThreadPage({ params }: any) {
  const id = params?.id as string;
  return (
    <main className="mx-auto max-w-5xl p-6">
      <h2 className="text-xl font-semibold">Thread {id}</h2>
      <ThreadPanel threadId={id} />
    </main>
  );
}
