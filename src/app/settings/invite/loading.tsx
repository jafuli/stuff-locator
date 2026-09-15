// Next's loading.tsx convention, scoped to this segment: page.tsx does a
// real (async, fallible) Supabase read/write to resolve or create the
// invite, so Next suspends on it and this fallback genuinely shows while
// that resolves.
export default function Loading() {
  return (
    <main className="flex flex-col gap-3 p-4" aria-busy="true" aria-live="polite">
      <div className="h-[18px] w-40 animate-pulse rounded bg-wash" aria-hidden="true" />
      <div className="h-[14px] w-56 animate-pulse rounded bg-wash" aria-hidden="true" />
      <div className="h-[110px] animate-pulse rounded-[9px] border-[1.5px] border-line bg-wash" aria-hidden="true" />
      <span className="sr-only">Loading your invite…</span>
    </main>
  );
}
