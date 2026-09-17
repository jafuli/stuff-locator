"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// Next's error.tsx convention, scoped to this segment so it doesn't
// inherit the root's home-page-specific "Couldn't load your stuff" copy.
// page.tsx's auth.getUser() read is a real Supabase call and throws into
// this boundary on failure — distinct from an invalid/expired invite CODE,
// which is JoinInviteFlow's own explicit error state, not this one.
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
        title="Couldn't load this page"
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
