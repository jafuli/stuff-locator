"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { triggerHouseholdBootstrap } from "@/lib/household-bootstrap-client";

/**
 * What "/" shows a signed-in user who has no household yet: the household
 * bootstrap at sign-up or sign-in failed, and HouseholdBootstrapNotice
 * auto-continued them here. "Try again" re-runs that same bootstrap
 * (POST /api/household/bootstrap) and refreshes, which lands a fresh
 * household on guided onboarding.
 *
 * The write happens only on this click, never while "/" renders: a prefetch
 * of "/" mid invite sign-up must not be able to create a household before
 * the redeem lands (ADR 0008).
 */
export function HouseholdSetupRetry() {
  const router = useRouter();
  const [isRetrying, setIsRetrying] = useState(false);
  const [failed, setFailed] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  async function retry() {
    setIsRetrying(true);
    setFailed(false);
    const ok = await triggerHouseholdBootstrap();
    setIsRetrying(false);
    if (!ok) {
      setFailed(true);
      return;
    }
    // The transition keeps the button busy until the refreshed page (with
    // the new household) has replaced this one.
    startRefresh(() => {
      router.refresh();
    });
  }

  return (
    <main className="flex flex-col gap-4 px-gutter pt-6">
      <EmptyState
        title="Your household isn't set up yet"
        titleAs="h1"
        description="Your account is ready, but setting up its household didn't finish. It only takes a moment."
        action={
          <Button onClick={() => void retry()} isLoading={isRetrying || isRefreshing}>
            Try again
          </Button>
        }
      />
      {failed ? (
        <p role="alert" className="text-center text-meta text-signal">
          That didn&apos;t work either. Check your connection and try again.
        </p>
      ) : null}
    </main>
  );
}
