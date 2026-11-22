"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// Next's error.tsx convention, scoped to this segment so it doesn't inherit
// the root's home-page-specific "Couldn't load your stuff" copy. page.tsx's
// household/locations read is a real Supabase call now and throws into this
// boundary on failure.
//
// Uses `retry` (see items/[id]/error.tsx's comment for why) — the same
// convention as the other new Browse route segment, /browse/[id]/error.tsx.
//
// Renders under the shared Stuff / Browse header (StuffViewsShell), which
// supplies the page's h1 and its <main>, so the error's title is an h2 in a
// plain div: a second h1 or a nested <main> would break the one-heading,
// one-landmark rule.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-6">
      <EmptyState
        title="Couldn't load rooms"
        titleAs="h2"
        description="Something went wrong. Check your connection and try again."
        action={
          <Button variant="secondary" onClick={retry}>
            Retry
          </Button>
        }
      />
    </div>
  );
}
