// Next's loading.tsx convention, scoped to this segment: without it, the
// root loading.tsx (home-page-shaped, "Our stuff" heading + search
// skeleton) would cascade here, which is wrong content for this route.
// page.tsx's own auth.getUser() read is what Next suspends on; this
// fallback shows while that resolves.
export default function Loading() {
  return (
    <main className="flex flex-col gap-4 px-gutter pt-6" aria-busy="true" aria-live="polite">
      <div className="h-8 w-40 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
      <div className="flex flex-col gap-3">
        <div
          className="h-control-height animate-pulse rounded-control border border-border-control bg-surface"
          aria-hidden="true"
        />
        <div
          className="h-control-height animate-pulse rounded-control border border-border-control bg-surface"
          aria-hidden="true"
        />
      </div>
      <span className="sr-only">Loading…</span>
    </main>
  );
}
