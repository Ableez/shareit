export default function OfflinePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-6 dark:bg-zinc-950">
      <h1 className="text-3xl font-semibold">You&apos;re offline</h1>
      <p className="max-w-md text-center text-zinc-600 dark:text-zinc-400">
        Shareit can&apos;t reach the network right now. Cached pages will still
        work, and any pending uploads will retry when you&apos;re back online.
      </p>
    </main>
  );
}
