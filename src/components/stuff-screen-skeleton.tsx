import { ItemCardSkeleton } from "@/components/item-card-skeleton";
import { STUFF_HEADING } from "@/lib/stuff-heading";

/**
 * The Stuff screen while its items load: the display heading, the search
 * field, then a ResultList panel of skeleton rows.
 *
 * Deliberately not src/app/loading.tsx any more. A root loading.tsx is the
 * fallback for every route without its own, so this Stuff-shaped skeleton
 * used to flash between /sign-in and /sign-up, and before the signed-out
 * marketing home. page.tsx now uses it as a Suspense fallback around the
 * signed-in data only; routes with no loading.tsx keep the old page on
 * screen until the new one is ready.
 */
export function StuffScreenSkeleton() {
  return (
    <main className="flex flex-col gap-4 px-gutter pt-6" aria-busy="true" aria-live="polite">
      <h1 className="text-display text-ink">{STUFF_HEADING}</h1>
      <div
        className="h-control-height animate-pulse rounded-control border border-border-control bg-surface"
        aria-hidden="true"
      />
      <div className="overflow-hidden rounded-panel border border-hairline bg-surface">
        <ItemCardSkeleton />
        <ItemCardSkeleton />
        <ItemCardSkeleton />
      </div>
      <span className="sr-only">Loading your stuff…</span>
    </main>
  );
}
