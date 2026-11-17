// Decides, on each Supabase auth event, whether the private caches must be
// emptied. It looks only at who the session belongs to, not at the event's
// name, so a new kind of event can't slip past it:
//
// - No session (SIGNED_OUT from the button, a failed refresh, an expired
//   session, sign-out in another tab; or a page load with no session) clears.
// - A session for someone other than the last user seen on this device clears.
//   That covers a different person signing in without the previous one
//   signing out first, e.g. after the cookie was removed.
// - The same user again (TOKEN_REFRESHED, a tab regaining focus) keeps the
//   caches, so offline browsing mid-session isn't wiped by routine events.
//
// An unknown last user (first visit, or storage unavailable) counts as
// different: clearing is cheap and the page in view gets cached again.

export interface CacheClearDecision {
  clear: boolean;
  /** What to remember as the last user on this device. */
  nextUserId: string | null;
}

export function decideCacheClear(userId: string | null, lastUserId: string | null): CacheClearDecision {
  if (userId === null) {
    return { clear: true, nextUserId: null };
  }
  return { clear: userId !== lastUserId, nextUserId: userId };
}
