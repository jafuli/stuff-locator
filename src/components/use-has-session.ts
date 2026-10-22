"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/server/db/client";

/**
 * Whether a Supabase session exists, tracked live via getSession +
 * onAuthStateChange — not a route-level check, so it protects no route; it
 * only stops the shell offering account controls (the household button,
 * Sign out) to a visitor who isn't signed in.
 *
 * `initial` lets a caller that only ever renders once a session is known
 * (the household sheet) skip the first-render "no session" frame, so its
 * contents don't pop in after it opens.
 */
export function useHasSession(initial = false): boolean {
  const [hasSession, setHasSession] = useState(initial);

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

  return hasSession;
}
