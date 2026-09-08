"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// Next's error.tsx convention, scoped to this segment so it doesn't inherit
// the root's home-page-specific "Couldn't load your stuff" copy. Real
// today — but ITEMS/LOCATIONS are synchronous fixture reads, so nothing
// currently throws here in practice. Ready for when a real (fallible)
// Supabase read replaces the fixture import.
//
// Uses `retry` (stable as of Next 16.3, per node_modules/next/dist/docs) —
// the currently-recommended prop name, documented as preferred over
// `reset` in most cases. The root error.tsx now also uses `retry` (see its
// own comment) — every error boundary in the repo is consistent.
//
// Renders EmptyState as this page's only content: the success-case
// items/[id] route has its own <h1> (the item's name), but that isn't in
// the tree here — an error boundary replaces the segment's content, it
// doesn't sit alongside it. So titleAs="h1" gives this route its own real
// heading instead of shipping with none.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Matches Next's own documented pattern. Only runs when a real error
    // boundary trips, not during normal rendering — doesn't violate the
    // "no console errors" bar for the app's happy path.
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <EmptyState
        title="Couldn't load this item"
        titleAs="h1"
        description="Something went wrong. Check your connection and try again."
        action={
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        }
      />
    </main>
  );
}
