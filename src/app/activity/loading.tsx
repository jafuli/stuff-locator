import { ItemCardSkeleton } from "@/components/item-card-skeleton";
import { ACTIVITY_HEADING } from "@/lib/activity-heading";

// Next's loading.tsx convention, scoped to this segment: without it, the
// root loading.tsx (the Stuff screen's skeleton) would cascade here, which is
// wrong content for Activity. The feed is a real, async Supabase read now, so
// this shows while it loads: the heading, then a panel of rows.
export default function Loading() {
  return (
    <main className="flex flex-col gap-4 px-gutter pt-6" aria-busy="true" aria-live="polite">
      <h1 className="text-display text-ink">{ACTIVITY_HEADING}</h1>
      <div className="overflow-hidden rounded-panel border border-hairline bg-surface">
        <ItemCardSkeleton />
        <ItemCardSkeleton />
        <ItemCardSkeleton />
      </div>
      <span className="sr-only">Loading your activity…</span>
    </main>
  );
}
