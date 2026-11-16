/**
 * Which paths src/proxy.ts lets through without an authenticated session.
 *
 * Deny-by-default: anything not named here needs a session. That's the
 * whole point of putting the rule in one place — a route added later is
 * protected by the act of existing, rather than by someone remembering to
 * paste an auth check into its page component. /activity is the route
 * that proved the old per-page approach leaks: it shipped reachable by
 * anyone, because nothing forced the question to be asked.
 *
 * "/" is not on the list: a signed-out "/" never reaches the gate, because
 * resolveRoute below rewrites it to the marketing home first.
 *
 * Static assets, /_next/*, /serwist/*, the manifest and /~offline never
 * reach this module at all — src/proxy.ts's own `matcher` filters them
 * out before the proxy function runs.
 */
export const PUBLIC_PATHS = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"] as const;

/**
 * The invite landing is public on purpose. src/app/(public)/join/[code]/page.tsx
 * resolves whether the visitor has a session and hands that down to
 * JoinInviteFlow, which shows a sign-up/sign-in toggle to a logged-out
 * one. Gating it would make every invite link dead for precisely the
 * person it was sent to — see e2e/join-invite.spec.ts, which lands on
 * /join/[code] with no account at all.
 */
const PUBLIC_PREFIXES = ["/join/"] as const;

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

/**
 * True when the proxy should require a session before letting the request
 * through. Takes a bare pathname (no query string) — `NextRequest`'s
 * `nextUrl.pathname`.
 */
export function requiresAuth(pathname: string): boolean {
  if (pathname.startsWith(API_PREFIX)) {
    return false;
  }

  const path = normalise(pathname);

  if ((PUBLIC_PATHS as readonly string[]).includes(path)) {
    return false;
  }

  return !PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));
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
