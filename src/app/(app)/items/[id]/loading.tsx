// Next's loading.tsx convention, scoped to this segment: without it, the
// root loading.tsx (the Stuff screen's list skeleton) would cascade here,
// which is wrong content for a detail route. page.tsx is an async Server
// Component (real household/item/locations reads), so Next suspends on it and
// this fallback genuinely shows while that resolves.
export default function Loading() {
  return (
    <main className="flex flex-col gap-4 px-gutter pt-4" aria-busy="true" aria-live="polite">
      <div className="h-6 w-24 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
      <div className="flex flex-col gap-3">
        <div className="h-8 w-2/3 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
        <div className="h-tape-height w-1/2 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
      </div>
      <div className="flex flex-col gap-3 rounded-panel border border-hairline bg-surface p-4">
        <div className="h-4 w-16 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
        <div className="h-4 w-20 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
      </div>
      <span className="sr-only">Loading this item…</span>
    </main>
  );
}
