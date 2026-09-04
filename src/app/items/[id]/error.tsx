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
// `reset` in most cases. The pre-existing root error.tsx still uses
// `reset` (written before this stabilized); flagged as a follow-up in the
// PR rather than migrated here, to keep this diff scoped to the new route.
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
