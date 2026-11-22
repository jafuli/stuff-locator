import { ItemCardSkeleton } from "@/components/item-card-skeleton";
import { StuffHeaderPlaceholder } from "@/components/stuff-header-placeholder";

/**
 * The Stuff screen while its items load: the real header (heading, search
 * row with Stash, chips; see StuffHeaderPlaceholder), then a ResultList
 * panel of skeleton rows.
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
      <StuffHeaderPlaceholder active="all" />
      <div className="overflow-hidden rounded-panel border border-hairline bg-surface">
        <ItemCardSkeleton />
        <ItemCardSkeleton />
        <ItemCardSkeleton />
      </div>
      <span className="sr-only">Loading your stuff…</span>
    </main>
  );
}
