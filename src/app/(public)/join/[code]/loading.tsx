import { SiteHeader } from "@/components/site-header";

// Next's loading.tsx convention, scoped to this segment: page.tsx's own
// auth.getUser() read is what Next suspends on; this fallback shows while
// that resolves. Shaped like the page inside the (public) column: the
// wordmark header, then the heading and two fields.
export default function Loading() {
  return (
    <>
      <SiteHeader homeLink />
      <main className="flex flex-col gap-4" aria-busy="true" aria-live="polite">
        <div className="h-8 w-40 animate-pulse rounded-tape bg-divider" aria-hidden="true" />
        <div className="flex flex-col gap-3">
          <div
            className="h-control-height animate-pulse rounded-control border border-border-control bg-surface"
            aria-hidden="true"
          />
          <div
            className="h-control-height animate-pulse rounded-control border border-border-control bg-surface"
            aria-hidden="true"
          />
        </div>
        <span className="sr-only">Loading…</span>
      </main>
    </>
  );
}
