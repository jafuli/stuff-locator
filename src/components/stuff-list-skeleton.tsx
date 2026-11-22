import { ItemCardSkeleton } from "@/components/item-card-skeleton";

/**
 * The list area of the Stuff and Browse views while it loads: a ResultList
 * panel of skeleton rows. Only the list: the header above it (heading,
 * search, Stash, chips) belongs to StuffViewsShell and stays on screen.
 *
 * Used by both views' loading.tsx and by the shell itself, which shows it the
 * moment a chip is tapped on a slow connection, before the server answers.
 */
export function StuffListSkeleton() {
  return (
    <div aria-busy="true">
      <div className="overflow-hidden rounded-panel border border-hairline bg-surface" aria-hidden="true">
        <ItemCardSkeleton />
        <ItemCardSkeleton />
        <ItemCardSkeleton />
      </div>
      <p role="status" className="sr-only">
        Loading…
      </p>
    </div>
  );
}
