"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// Next's error.tsx convention, scoped to this segment so it doesn't inherit
// the root's home-page-specific "Couldn't load your stuff" copy. Real
// today — but LOCATIONS is a synchronous fixture read, so nothing currently
// throws here in practice. Ready for when a real (fallible) Supabase read
// replaces the fixture import. Uses `retry` — see items/[id]/error.tsx's
// comment for why that's preferred over `reset` here.
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
        title="Couldn't load the add-item form"
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
