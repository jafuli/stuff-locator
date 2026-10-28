import { ItemCardSkeleton } from "@/components/item-card-skeleton";
import { STUFF_HEADING } from "@/lib/stuff-heading";

// Next's loading.tsx convention: wraps page.tsx in this segment in a
// Suspense boundary. page.tsx is now an async Server Component (real
// household/items/locations reads), so Next suspends on it and this
// fallback genuinely shows while that resolves. Shaped like the Stuff
// screen: the display heading, the search field, then a ResultList panel.
export default function Loading() {
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
