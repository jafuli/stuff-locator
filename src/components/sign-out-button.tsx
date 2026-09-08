"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/server/db/client";

/**
 * The one sign-out affordance reachable from anywhere in the app (rendered
 * from SiteNav, below the bottom tab bar). Renders nothing until a session
 * actually exists — tracked directly via getSession + onAuthStateChange,
 * not a route-level check, so this still doesn't gate/protect any route
 * (AC #6): it just stops offering to sign out a visitor who isn't signed
 * in, which was a real, reported bug on /sign-up and /sign-in themselves
 * (an earlier revision showed this unconditionally).
 *
 * That same earlier revision also had a stuck-loading bug: clicking sign
 * out while already on /sign-in pushed to the page you're already on,
 * which Next doesn't remount — so "Signing out…" never resolved back. The
 * try/finally below guarantees isSigningOut clears regardless of whether
 * the call succeeds, fails, or navigates nowhere; hiding the control once
 * hasSession flips to false (which signOut() itself triggers, via the
 * subscription below) removes the repro entirely, but the reset is kept
 * as a real fix, not incidental.
 */
export function SignOutButton() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let isMounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setHasSession(data.session !== null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        setHasSession(session !== null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

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
    <div className="flex flex-col items-center gap-1 border-t border-line bg-wash py-1.5">
      <button
        type="button"
        onClick={() => void handleSignOut()}
        disabled={isSigningOut}
        aria-busy={isSigningOut || undefined}
        className="px-2 py-1 text-[10px] text-mid outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
      >
        {isSigningOut ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <p role="alert" className="text-[10px] text-mid">
          {error}
        </p>
      ) : null}
    </div>
  );
}
