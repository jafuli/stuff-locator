/**
 * The two app-wide paths, in one place. Every link, redirect, test and e2e
 * spec that means "the Stuff screen" or "the front door" uses these, and
 * src/__tests__/route-constants.test.ts fails on a literal that bypasses
 * them in src/app or src/components.
 *
 * Why the app lives at /stuff and not "/": with both at "/", one URL was two
 * documents (the marketing home signed out, the Stuff screen signed in), and
 * every cache keyed by URL — the client router's prefetch cache, the service
 * worker's `others` cache — could hand one to the other. See the 2026-11-17
 * amendment to ADR 0013.
 */

/**
 * The Stuff screen: the signed-in home, and where sign-in lands by default.
 *
 * The folder src/app/(app)/stuff/ IS this route — Next derives URLs from the
 * file system — so changing this value means renaming that folder too.
 * route-access.test.ts ("every listed route is a real page") fails if the two
 * drift, because PROTECTED_ROUTES lists this constant.
 */
export const STUFF_PATH = "/stuff";

/**
 * The site root, which is the marketing home (src/app/(public)/page.tsx).
 * A signed-in visitor asking for it is redirected to STUFF_PATH by the proxy.
 */
export const MARKETING_PATH = "/";

/** The Stuff screen with a search already applied, as Browse's search box builds it. */
export function stuffSearchHref(query: string): string {
  return `${STUFF_PATH}?q=${encodeURIComponent(query)}`;
}
