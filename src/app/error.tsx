"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// Next's error.tsx convention: a Client Component error boundary for this
// segment. Real today — but ITEMS/LOCATIONS are synchronous fixture reads,
// so nothing currently throws here in practice. Ready for when a real
// (fallible) Supabase read replaces the fixture import.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Matches Next's own documented pattern for error.tsx. Only runs when a
    // real error boundary trips, not during normal rendering — doesn't
    // violate the "no console errors" bar for the app's happy path.
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <EmptyState
        title="Couldn't load your stuff"
        description="Something went wrong. Check your connection and try again."
        action={
          <Button variant="secondary" onClick={reset}>
            Retry
          </Button>
        }
      />
    </main>
  );
}
