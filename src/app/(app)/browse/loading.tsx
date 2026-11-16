import { ItemCardSkeleton } from "@/components/item-card-skeleton";
import { STUFF_HEADING } from "@/lib/stuff-heading";

// Next's loading.tsx convention, scoped to this segment: Browse's top level
// shares the Stuff header, so this is the same shape — heading, search
// field, a panel of rows — but is its own file so the skeleton can't drift
// when Stuff's does. page.tsx is an async Server Component (a real
// household/locations read), so Next suspends on it and this fallback
// genuinely shows while that resolves.
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
      <span className="sr-only">Loading rooms…</span>
    </main>
  );
}
