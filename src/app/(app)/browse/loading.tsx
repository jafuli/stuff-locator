import { ItemCardSkeleton } from "@/components/item-card-skeleton";
import { StuffHeaderPlaceholder } from "@/components/stuff-header-placeholder";

// Next's loading.tsx convention, scoped to this segment: Browse's top level
// shares the Stuff header, so this draws that same header (shared with the
// Stuff skeleton through StuffHeaderPlaceholder, so switching All / By place
// never flashes a different header) above a panel of skeleton rows. page.tsx is an async Server Component (a real
// household/locations read), so Next suspends on it and this fallback
// genuinely shows while that resolves.
export default function Loading() {
  return (
    <main className="flex flex-col gap-4 px-gutter pt-6" aria-busy="true" aria-live="polite">
      <StuffHeaderPlaceholder active="place" />
      <div className="overflow-hidden rounded-panel border border-hairline bg-surface">
        <ItemCardSkeleton />
        <ItemCardSkeleton />
        <ItemCardSkeleton />
      </div>
      <span className="sr-only">Loading rooms…</span>
    </main>
  );
}
