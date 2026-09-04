// Next's loading.tsx convention, scoped to this segment: without it, the
// root loading.tsx (home-page-shaped, "Our stuff" heading + search
// skeleton) would cascade here, which is wrong content for Browse. Real
// today — but LOCATIONS is a synchronous fixture read, so nothing currently
// suspends, so this rarely shows in practice. Ready for when a real (async)
// Supabase read replaces the fixture import; see the PR description.
export default function Loading() {
  return (
    <main className="flex flex-col gap-3 p-4" aria-busy="true" aria-live="polite">
      <div className="h-[11.5px] w-20 animate-pulse rounded bg-wash" aria-hidden="true" />
      <div className="h-[18px] w-16 animate-pulse rounded bg-wash" aria-hidden="true" />
      <div className="flex flex-col gap-2">
        <div className="h-[13.5px] w-1/3 animate-pulse rounded bg-wash" aria-hidden="true" />
        <div className="h-[13.5px] w-1/3 animate-pulse rounded bg-wash" aria-hidden="true" />
        <div className="h-[13.5px] w-1/3 animate-pulse rounded bg-wash" aria-hidden="true" />
      </div>
      <span className="sr-only">Loading rooms…</span>
    </main>
  );
}
