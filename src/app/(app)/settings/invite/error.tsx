"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

// Next's error.tsx convention, scoped to this segment. page.tsx's
// household/invite reads and the create-invite write are real Supabase
// calls and throw into this boundary on failure — e.g. a network error or
// an RLS rejection on the insert (shouldn't happen through this UI, but
// the read/write can still fail for other reasons). Uses `retry` — see
// items/[id]/error.tsx's comment for why that's preferred over `reset`.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-6">
      <EmptyState
        title="Couldn't load your invite"
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
