// Next's loading.tsx convention, scoped to this segment: page.tsx does a
// real (async, fallible) Supabase read/write to resolve or create the
// invite, so Next suspends on it and this fallback genuinely shows while
// that resolves.
export default function Loading() {
  return (
    <main className="flex flex-col gap-4 px-gutter pt-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-40 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
      <div className="h-4 w-56 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
      <div className="h-28 animate-pulse rounded-panel border border-hairline bg-surface" aria-hidden="true" />
      <span className="sr-only">Loading your invite…</span>
    </main>
  );
}
