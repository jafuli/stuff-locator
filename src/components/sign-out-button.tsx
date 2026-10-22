"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useHasSession } from "@/components/use-has-session";
import { createClient } from "@/server/db/client";

export interface SignOutButtonProps {
  /**
   * For a caller that only renders once a session is known (the household
   * sheet): skips the first-render "no session" frame so the row is there
   * the moment the sheet opens.
   */
  assumeSession?: boolean;
}

/**
 * The sign-out affordance — now the last row of the household sheet (see
 * household-menu.tsx), signal-coloured because it's the destructive one.
 * Renders nothing until a session actually exists (useHasSession), so it
 * never offers to sign out a visitor who isn't signed in — a real, reported
 * bug on /sign-up and /sign-in themselves (an earlier revision showed this
 * unconditionally).
 *
 * That same earlier revision also had a stuck-loading bug: clicking sign
 * out while already on /sign-in pushed to the page you're already on,
 * which Next doesn't remount — so "Signing out…" never resolved back. The
 * try/finally below guarantees isSigningOut clears regardless of whether
 * the call succeeds, fails, or navigates nowhere.
 */
export function SignOutButton({ assumeSession = false }: SignOutButtonProps) {
  const router = useRouter();
  const hasSession = useHasSession(assumeSession);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setIsSigningOut(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(signOutError.message);
        return;
      }
      router.push("/sign-in");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  if (!hasSession) {
    return null;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={isSigningOut}
        aria-busy={isSigningOut || undefined}
        className="flex min-h-14 w-full items-center px-5 text-left text-body text-signal outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
      >
        {isSigningOut ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <p role="alert" className="px-5 pb-3 text-meta text-signal">
          {error}
        </p>
      ) : null}
    </div>
  );
}
