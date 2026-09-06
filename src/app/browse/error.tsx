"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// Next's error.tsx convention, scoped to this segment so it doesn't inherit
// the root's home-page-specific "Couldn't load your stuff" copy. Real
// today — but LOCATIONS is a synchronous fixture read, so nothing currently
// throws here in practice. Ready for when a real (fallible) Supabase read
// replaces the fixture import.
//
// Uses `retry` (see items/[id]/error.tsx's comment for why) — the same
// convention as the other new Browse route segment, /browse/[id]/error.tsx.
//
// Renders EmptyState as this page's only content — nothing else in the
// tree supplies a heading for an error boundary — so titleAs="h1" gives
// this route a real one. Extends the "Fix missing headings" task's fix to
// this route too: it merged after that task's AC was written, so it
// wasn't in the AC's original list, but has the identical gap.
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
        title="Couldn't load rooms"
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
