import { ItemCardSkeleton } from "@/components/item-card-skeleton";

// Next's loading.tsx convention: wraps page.tsx in this segment in a
// Suspense boundary. Real today — but since ITEMS/LOCATIONS are synchronous
// fixture reads, nothing currently suspends, so this rarely shows in
// practice. It's ready for when a real (async) Supabase read replaces the
// fixture import; see the PR description.
export default function Loading() {
  return (
    <main className="flex flex-col gap-3 p-4" aria-busy="true" aria-live="polite">
      <h1 className="text-[16px] font-semibold text-ink">Our stuff</h1>
      <div className="h-[34px] animate-pulse rounded-[9px] border-[1.5px] border-line bg-wash" aria-hidden="true" />
      <div>
        <ItemCardSkeleton />
        <ItemCardSkeleton />
        <ItemCardSkeleton />
      </div>
      <span className="sr-only">Loading your stuff…</span>
    </main>
  );
}
