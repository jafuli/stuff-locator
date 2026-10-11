// Next's loading.tsx convention, scoped to this segment: without it, the
// root loading.tsx (home-page-shaped, "Our stuff" heading + search
// skeleton) would cascade here, which is wrong content for Activity. The
// feed is a real, async Supabase read now, so this shows while it loads.
export default function Loading() {
  return (
    <main className="flex flex-col gap-3 p-4" aria-busy="true" aria-live="polite">
      <div className="h-[18px] w-16 animate-pulse rounded bg-wash" aria-hidden="true" />
      <div className="flex flex-col gap-3">
        <div className="h-[13.5px] w-2/3 animate-pulse rounded bg-wash" aria-hidden="true" />
        <div className="h-[13.5px] w-2/3 animate-pulse rounded bg-wash" aria-hidden="true" />
        <div className="h-[13.5px] w-2/3 animate-pulse rounded bg-wash" aria-hidden="true" />
      </div>
      <span className="sr-only">Loading your activity…</span>
    </main>
  );
}
