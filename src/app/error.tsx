"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// Next's error.tsx convention: a Client Component error boundary for this
// segment. Real today — but ITEMS/LOCATIONS are synchronous fixture reads,
// so nothing currently throws here in practice. Ready for when a real
// (fallible) Supabase read replaces the fixture import.
//
// Uses `retry` — stable as of Next 16.3.0 (this repo runs 16.3.1; verified
// against node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md,
// which documents `retry` as preferred over `reset` in most cases). This
// route previously used `reset`, written before `retry` stabilized;
// items/[id]/error.tsx and browse's error boundaries already used `retry`,
// so this migration makes every error boundary in the repo consistent.
//
// Renders EmptyState as this page's only content — nothing above it in the
// tree supplies a heading (root layout.tsx renders only SiteNav, a <nav>) —
// so titleAs="h1" gives this route a real heading instead of shipping with
// none.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
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
