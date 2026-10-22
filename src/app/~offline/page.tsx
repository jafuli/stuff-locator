// min-h-full (not min-h-dvh): this page sits inside root layout.tsx's
// already-height-constrained scroll container (body is `flex h-dvh
// flex-col`, wrapping a `flex-1 overflow-y-auto` div around page content).
// min-h-dvh forces a full extra viewport height on top of that constrained
// container, creating empty scrollable space below the centered content,
// underneath the fixed nav bar. min-h-full instead resolves against the
// parent's actual (already-correct) height, filling exactly the visible
// area with no slack. Verified at 320x568 and 1280x1024.
//
// The calc subtracts the height NavClearance (site-nav.tsx) reserves at the
// end of the scroller for the floating nav; without it, min-h-full plus that
// spacer would overflow by exactly the spacer's height.
export default function OfflinePage() {
  return (
    <main className="flex min-h-[calc(100%-var(--spacing-nav-clearance))] flex-col items-center justify-center gap-3 px-gutter text-center">
      <h1 className="text-display text-ink">You&apos;re offline</h1>
      <p className="max-w-sm text-body text-muted">
        Stuff Locator needs a connection for this page. Anything you&apos;ve already loaded is still available.
      </p>
    </main>
  );
}
