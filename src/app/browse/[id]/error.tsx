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
// — the same convention every error boundary in the repo now uses.
//
// Renders EmptyState as this page's only content: the success-case
// /browse/[id] route has its own <h1> (the location's name), but that
// isn't in the tree here — an error boundary replaces the segment's
// content. titleAs="h1" gives this route its own real heading. Extends
// the "Fix missing headings" task's fix to this route too: it merged after
// that task's AC was written, so it wasn't in the AC's original list, but
// has the identical gap.
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
