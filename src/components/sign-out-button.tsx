"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/server/db/client";

/**
 * The one sign-out affordance reachable from anywhere in the app (rendered
 * from SiteNav, below the bottom tab bar). Deliberately doesn't check
 * whether a session currently exists — supabase.auth.signOut() is a no-op
 * if there isn't one — so this stays the simple, always-present control the
 * task asks for rather than adding a client-side session subscription
 * elsewhere in the app. That also means it renders on /sign-in and /sign-up
 * themselves (see site-nav.tsx's comment); clicking it there is harmless.
 */
export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={() => void handleSignOut()}
      disabled={isSigningOut}
      aria-busy={isSigningOut || undefined}
      className="px-2 py-1 text-[10px] text-mid outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-60"
    >
      {isSigningOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
