"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// Next's error.tsx convention, scoped to this segment. Real today — but
// LOCATIONS/ITEMS are synchronous fixture reads, so nothing currently
// throws here in practice. Ready for when a real (fallible) Supabase read
// replaces the fixture import.
//
// Uses `retry` (stable as of Next 16.3 — see items/[id]/error.tsx's comment)
// rather than the older `reset` the root app/error.tsx still uses.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <EmptyState
        title="Couldn't load this location"
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
