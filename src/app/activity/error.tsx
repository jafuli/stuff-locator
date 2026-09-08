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
// Uses `retry` (see items/[id]/error.tsx's comment for why) — the same
// convention as the other segment-scoped error boundaries.
//
// Self-review flagged that this route renders EmptyState (whose title is a
// <p> by design — see its own doc comment) as its only content, with no
// heading anywhere in the tree — a real semantic-HTML/DoD gap, same one a
// separately-queued task ("Fix missing headings") fixes for the other
// pre-existing error/not-found routes via an EmptyState prop. This route
// didn't exist when that task's scope was written, so it supplies its own
// sr-only <h1> independently here rather than waiting on that prop to land.
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
      <h1 className="sr-only">Couldn&apos;t load your activity</h1>
      <EmptyState
        title="Couldn't load your activity"
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
