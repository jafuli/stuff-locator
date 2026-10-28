import { ItemCardSkeleton } from "@/components/item-card-skeleton";

// Next's loading.tsx convention, scoped to this segment: without it, the
// root loading.tsx (the Stuff screen's skeleton) would cascade here, which is
// wrong content for a place's contents route. page.tsx is an async Server
// Component (real location/child-location/subtree-item reads), so Next
// suspends on it and this fallback genuinely shows while that resolves.
export default function Loading() {
  return (
    <main className="flex flex-col gap-4 px-gutter pt-4" aria-busy="true" aria-live="polite">
      <div className="h-6 w-24 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
      <div className="flex flex-col gap-3">
        <div className="h-8 w-1/2 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
        <div className="h-tape-height w-2/3 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
      </div>
      <div className="overflow-hidden rounded-panel border border-hairline bg-surface">
        <ItemCardSkeleton />
        <ItemCardSkeleton />
      </div>
      <span className="sr-only">Loading this location…</span>
    </main>
  );
}
