"use client";

import { useEffect } from "react";
import { createClient } from "@/server/db/client";
import { decideCacheClear } from "@/lib/offline/cache-clear-decision";
import { clearPrivateCaches } from "@/lib/offline/clear-private-caches";

const LAST_USER_KEY = "stuff-locator:last-user-id";

/**
 * Empties the service worker's household-data caches whenever the session
 * ends or changes hands, however that happens: the Sign out button, a refresh
 * that failed, sign-out in another tab (supabase-js relays it), or a different
 * person signing in on this device. The rules are in decideCacheClear.
 *
 * Mounted once in the root layout and renders nothing. The Sign out button
 * also clears, and waits for it before redirecting; this guard is the net for
 * every session end that doesn't go through that button.
 * See docs/adr/0014-offline-cache-policy-for-signed-in-data.md.
 */
export function PrivateCacheGuard(): null {
  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const decision = decideCacheClear(session?.user.id ?? null, readLastUserId());
      writeLastUserId(decision.nextUserId);
      if (decision.clear) {
        void clearPrivateCaches();
      }
    });
    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}

// localStorage can throw (blocked storage, some private modes). Unreadable
// means "unknown", which decideCacheClear treats as a different user.
function readLastUserId(): string | null {
  try {
    return window.localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

function writeLastUserId(userId: string | null): void {
  try {
    if (userId === null) {
      window.localStorage.removeItem(LAST_USER_KEY);
    } else {
      window.localStorage.setItem(LAST_USER_KEY, userId);
    }
  } catch {
    // Nothing to do: the next event will treat the user as unknown and clear.
  }
}
