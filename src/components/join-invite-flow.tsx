"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SignInForm } from "@/components/sign-in-form";
import { SignUpForm } from "@/components/sign-up-form";
import { redeemInviteAndGetHouseholdName, type RedeemInviteResult } from "@/lib/redeem-invite-client";
import { createClient } from "@/server/db/client";

export interface JoinInviteFlowProps {
  code: string;
  /** Resolved server-side from the session cookie — whether to redeem
   * immediately or show sign-up/sign-in first. */
  initiallySignedIn: boolean;
}

type AuthMode = "sign-up" | "sign-in";
type Stage =
  | { status: "authenticating" }
  | { status: "redeeming" }
  | { status: "success"; householdName: string | null }
  | { status: "error"; message: string };

const LINK_CLASSES =
  "inline-flex w-fit items-center justify-center rounded-[8px] bg-ink px-[10px] py-[10px] text-[13px] font-semibold text-white outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * Owns the whole /join/[code] flow client-side, in one mounted component —
 * no navigation to a separate /sign-up or /sign-in route, and so no need to
 * carry the code through a query param across a real page load (this
 * task's AC offers either option; this is the "client-side state" one,
 * chosen because it keeps the invite code out of the URL history/referrer
 * of an otherwise-unrelated auth page, and avoids having to teach
 * /sign-up and /sign-in themselves about a `?code=` param that only this
 * one entry point needs — see the PR description for the full tradeoff).
 *
 * Redemption itself is the same for both entry points — an already
 * signed-in visitor redeems directly (useEffect below); a signed-out one
 * redeems as part of SignUpForm/SignInForm's own submit, BEFORE those
 * forms' household-bootstrap call (see their `invite` prop) — but both
 * paths land in the same success/error state here, via
 * redeemInviteAndGetHouseholdName (see that function's own doc comment for
 * why calling it twice for the same code is safe).
 */
export function JoinInviteFlow({ code, initiallySignedIn }: JoinInviteFlowProps) {
  const [authMode, setAuthMode] = useState<AuthMode>("sign-up");
  const [stage, setStage] = useState<Stage>(
    initiallySignedIn ? { status: "redeeming" } : { status: "authenticating" },
  );

  useEffect(() => {
    if (stage.status !== "redeeming") {
      return;
    }
    const cancelled = { current: false };

    void (async () => {
      const supabase = createClient();
      const result = await redeemInviteAndGetHouseholdName(supabase, code);
      if (cancelled.current) {
        return;
      }
      setStage(
        result.ok
          ? { status: "success", householdName: result.householdName }
          : { status: "error", message: result.error },
      );
    })();

    return () => {
      cancelled.current = true;
    };
  }, [stage.status, code]);

  function handleRedeemed(result: RedeemInviteResult) {
    setStage(
      result.ok ? { status: "success", householdName: result.householdName } : { status: "error", message: result.error },
    );
  }

  if (stage.status === "success") {
    return (
      <div role="status" className="flex flex-col gap-3 rounded-[9px] border-[1.5px] border-line p-4">
        <p className="text-[13px] text-ink">
          You&apos;ve joined <span className="font-semibold">{stage.householdName ?? "the household"}</span>&apos;s
          home
        </p>
        <Link href="/" className={LINK_CLASSES}>
          Go to Stuff Locator
        </Link>
      </div>
    );
  }

  if (stage.status === "error") {
    return (
      <div role="alert" className="flex flex-col gap-3 rounded-[9px] border-[1.5px] border-line p-4">
        <p className="text-[13px] font-semibold text-ink">Couldn&apos;t join this household</p>
        <p className="text-[12px] text-mid">{stage.message}</p>
        <Link href="/" className={LINK_CLASSES}>
          Back to Stuff Locator
        </Link>
      </div>
    );
  }

  if (stage.status === "redeeming") {
    return (
      <div aria-busy="true" aria-live="polite" className="flex flex-col gap-2">
        <div className="h-[34px] animate-pulse rounded-[9px] border-[1.5px] border-line bg-wash" aria-hidden="true" />
        <span className="sr-only">Joining the household…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {authMode === "sign-up" ? (
        <SignUpForm invite={{ code, onRedeemed: handleRedeemed }} />
      ) : (
        <SignInForm invite={{ code, onRedeemed: handleRedeemed }} />
      )}
      <button
        type="button"
        onClick={() => {
          setAuthMode(authMode === "sign-up" ? "sign-in" : "sign-up");
        }}
        className="text-center text-[11.5px] font-semibold text-ink underline underline-offset-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {authMode === "sign-up" ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
      </button>
    </div>
  );
}
