// Next's loading.tsx convention, scoped to this segment: without it, the
// nearest ancestor loading.tsx (item-detail-shaped) would cascade here,
// which is the wrong skeleton shape for a form. Real today — but
// ITEMS/LOCATIONS are synchronous fixture reads, so nothing currently
// suspends, so this rarely shows in practice. Ready for when a real
// (async) Supabase read replaces the fixture import.
export default function Loading() {
  return (
    <main className="flex flex-col gap-3 p-4" aria-busy="true" aria-live="polite">
      <div className="h-[18px] w-32 animate-pulse rounded bg-wash" aria-hidden="true" />
      <div className="flex flex-col gap-3">
        <div className="h-[34px] animate-pulse rounded-[9px] border-[1.5px] border-line bg-wash" aria-hidden="true" />
        <div className="h-[34px] animate-pulse rounded-[9px] border-[1.5px] border-line bg-wash" aria-hidden="true" />
        <div className="h-[34px] animate-pulse rounded-[9px] border-[1.5px] border-line bg-wash" aria-hidden="true" />
      </div>
      <span className="sr-only">Loading the edit-item form…</span>
    </main>
  );
}
