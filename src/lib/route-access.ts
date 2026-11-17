/**
 * Which requests src/proxy.ts lets through without an authenticated session.
 *
 * Deny-by-default (ADR 0006): every real page is either public or protected,
 * and the two lists below name them all. src/__tests__/route-access.test.ts
 * walks src/app and fails if a page is in neither list, so a route added
 * later can't go public by being forgotten. /activity is the route that
 * proved the old per-page approach leaks: it shipped reachable by anyone,
 * because nothing forced the question to be asked.
 *
 * A path that matches no real page is "unknown", and passes through without a
 * session to the root not-found page (standalone, no data). Bouncing it to
 * /sign-in first only produced a 404 after signing in (amendment to ADR
 * 0006, 2026-11-17). A real route with an id that doesn't exist
 * (/items/<missing>) is not unknown: it matches /items/[id], so it is still
 * gated, because whether an item exists is data only a member may learn.
 *
 * Patterns use the app router's own spelling: "[param]" matches exactly one
 * non-empty path segment.
 *
 * Static assets, /_next/*, /serwist/*, the manifest and /~offline never
 * reach this module at all — src/proxy.ts's own `matcher` filters them
 * out before the proxy function runs.
 */

/** The auth pages. Also read by safeRedirectPath: never a return target. */
export const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"] as const;

/**
 * Pages anyone may open. The invite landing is public on purpose:
 * (public)/join/[code]/page.tsx resolves whether the visitor has a session
 * and hands that to JoinInviteFlow, which shows a sign-up/sign-in toggle to
 * a signed-out one. Gating it would make every invite link dead for
 * precisely the person it was sent to (e2e/join-invite.spec.ts).
 */
export const PUBLIC_ROUTES = [...PUBLIC_PATHS, "/join/[code]"] as const;

/**
 * Pages that need a session. "/" is here because a signed-in "/" is the
 * Stuff screen; a signed-out "/" never reaches the gate, since resolveRoute
 * rewrites it to the marketing home first (ADR 0013).
 */
export const PROTECTED_ROUTES = [
  "/",
  "/browse",
  "/browse/[id]",
  "/items/new",
  "/items/[id]",
  "/items/[id]/edit",
  "/activity",
  "/settings/invite",
  "/~components",
] as const;

/**
 * Route handlers answer for themselves. POST /api/household/bootstrap
 * already returns 401 JSON to a signed-out caller; bouncing it to
 * /sign-in instead would hand its fetch() a 307 and an HTML page where it
 * expects a status code it can branch on.
 */
const API_PREFIX = "/api/";

function normalise(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** True when `path` (already normalised) is an instance of `pattern`. */
export function matchesRoute(path: string, pattern: string): boolean {
  const actual = path.split("/");
  const expected = pattern.split("/");
  if (actual.length !== expected.length) {
    return false;
  }
  return expected.every((segment, i) => {
    const part = actual[i] ?? "";
    return /^\[[^\]]+\]$/.test(segment) ? part.length > 0 : segment === part;
  });
}

function matchesAny(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesRoute(path, pattern));
}

/**
 * True when the proxy should require a session before letting the request
 * through: the path is one of the protected pages. Public pages, route
 * handlers and unknown paths don't. Takes a bare pathname (no query string),
 * `NextRequest`'s `nextUrl.pathname`.
 */
export function requiresAuth(pathname: string): boolean {
  if (pathname.startsWith(API_PREFIX)) {
    return false;
  }

  const path = normalise(pathname);
  return !matchesAny(path, PUBLIC_ROUTES) && matchesAny(path, PROTECTED_ROUTES);
}

/**
 * The marketing home's real route. Signed out, "/" is rewritten here (the
 * URL in the address bar stays "/"); asked for by name, it redirects to "/"
 * so the page has one canonical URL. See ADR 0013.
 */
export const MARKETING_PATH = "/welcome";

export type RouteDecision =
  { kind: "next" } | { kind: "rewrite"; pathname: string } | { kind: "redirect"; pathname: string; next?: string };

/**
 * Everything src/proxy.ts decides about a request, as data, so it can be
 * tested without a NextRequest. `search` is the query string including its
 * "?" (or ""), carried into the sign-in return path.
 */
export function resolveRoute(pathname: string, search: string, signedIn: boolean): RouteDecision {
  const path = normalise(pathname);

  if (path === MARKETING_PATH) {
    return { kind: "redirect", pathname: "/" };
  }

  if (path === "/" && !signedIn) {
    return { kind: "rewrite", pathname: MARKETING_PATH };
  }

  if (signedIn || !requiresAuth(pathname)) {
    return { kind: "next" };
  }

  return { kind: "redirect", pathname: "/sign-in", next: `${pathname}${search}` };
}
