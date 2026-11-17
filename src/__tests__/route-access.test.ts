import { expect, test } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import {
  MARKETING_PATH,
  PROTECTED_ROUTES,
  PUBLIC_PATHS,
  PUBLIC_ROUTES,
  matchesRoute,
  requiresAuth,
  resolveRoute,
} from "@/lib/route-access";

// The routes the route-protection task's Acceptance Criteria named as
// protected. Spelled out one per entry rather than generated, so the list is
// reviewable line by line. "/" is gated too: a signed-out "/" is rewritten
// to the marketing home before the gate runs (see resolveRoute below).
const AC_PROTECTED_ROUTES = [
  "/",
  "/browse",
  "/browse/2a4e6c9b-0000-4000-8000-000000000001",
  "/items/2a4e6c9b-0000-4000-8000-000000000002",
  "/items/2a4e6c9b-0000-4000-8000-000000000002/edit",
  "/items/new",
  "/activity",
];

test.each(AC_PROTECTED_ROUTES)("%s requires a session", (path) => {
  expect(requiresAuth(path)).toBe(true);
});

// AC #2: the auth pages stay reachable without a session. A regression here
// locks every user out of the app permanently, including the ability to
// get back in.
test.each([...PUBLIC_PATHS])("%s stays reachable without a session", (path) => {
  expect(requiresAuth(path)).toBe(false);
});

test("the invite landing is public — its whole audience is people without an account yet", () => {
  expect(requiresAuth("/join/abc123")).toBe(false);
});

test("pages the AC doesn't enumerate are still protected, because every page must be listed", () => {
  // /settings/invite reads real household data and is not in the AC's
  // list; the completeness test at the bottom is what makes sure it's covered.
  expect(requiresAuth("/settings/invite")).toBe(true);
  expect(requiresAuth("/~components")).toBe(true);
});

test("a path that matches no page needs no session: it can only ever be the 404", () => {
  // Amendment to ADR 0006 (2026-11-17): bouncing /badroute through sign-in
  // only produced a 404 after signing in.
  expect(requiresAuth("/badroute")).toBe(false);
  expect(requiresAuth("/some/route/nobody/has/written/yet")).toBe(false);
  expect(resolveRoute("/badroute", "", false)).toEqual({ kind: "next" });
});

test("a real route with an id that may not exist is still gated: existence is member-only data", () => {
  expect(resolveRoute("/items/not-a-real-id", "", false)).toEqual({
    kind: "redirect",
    pathname: "/sign-in",
    next: "/items/not-a-real-id",
  });
  expect(requiresAuth("/browse/whatever")).toBe(true);
  expect(requiresAuth("/items/whatever/edit")).toBe(true);
});

test("route handlers are left to answer for themselves, not redirected", () => {
  // Bouncing these to /sign-in would turn the 401 JSON the client branches
  // on into a 307 and an HTML page.
  expect(requiresAuth("/api/household/bootstrap")).toBe(false);
});

test("a trailing slash doesn't smuggle a protected route past the allowlist, or lock a public one out", () => {
  expect(requiresAuth("/sign-in/")).toBe(false);
  expect(requiresAuth("/activity/")).toBe(true);
});

test("route patterns match whole segments, so a lookalike path is never a public page", () => {
  // "/sign-innocuous" shares a prefix with "/sign-in"; a matcher built on
  // startsWith instead of segments would treat it as public.
  expect(matchesRoute("/sign-innocuous", "/sign-in")).toBe(false);
  expect(matchesRoute("/joined", "/join/[code]")).toBe(false);
  expect(matchesRoute("/join/abc/extra", "/join/[code]")).toBe(false);
  expect(matchesRoute("/join", "/join/[code]")).toBe(false);
  expect(matchesRoute("/items//edit", "/items/[id]/edit")).toBe(false);
  expect(matchesRoute("/items/abc/edit", "/items/[id]/edit")).toBe(true);
  // A static segment beats nothing: /items/new is listed in its own right.
  expect(matchesRoute("/items/new", "/items/new")).toBe(true);
});

test("signed out, / is rewritten to the marketing home and the URL stays /", () => {
  expect(resolveRoute("/", "", false)).toEqual({ kind: "rewrite", pathname: "/welcome" });
  expect(resolveRoute("/", "?q=keys", false)).toEqual({ kind: "rewrite", pathname: "/welcome" });
});

test("signed in, / is the Stuff screen", () => {
  expect(resolveRoute("/", "", true)).toEqual({ kind: "next" });
});

test("/welcome redirects to /, signed in or out, so the marketing home has one URL", () => {
  expect(resolveRoute("/welcome", "", false)).toEqual({ kind: "redirect", pathname: "/" });
  expect(resolveRoute("/welcome/", "", true)).toEqual({ kind: "redirect", pathname: "/" });
});

test("signed out, a protected route redirects to sign-in carrying the full return path", () => {
  expect(resolveRoute("/browse", "", false)).toEqual({ kind: "redirect", pathname: "/sign-in", next: "/browse" });
  expect(resolveRoute("/items/abc", "?tab=x", false)).toEqual({
    kind: "redirect",
    pathname: "/sign-in",
    next: "/items/abc?tab=x",
  });
});

test("public pages and route handlers pass straight through", () => {
  expect(resolveRoute("/sign-in", "?next=%2Fbrowse", false)).toEqual({ kind: "next" });
  expect(resolveRoute("/join/abc123", "", false)).toEqual({ kind: "next" });
  expect(resolveRoute("/api/household/bootstrap", "", false)).toEqual({ kind: "next" });
  expect(resolveRoute("/browse", "", true)).toEqual({ kind: "next" });
});

/**
 * Every page.tsx under src/app as a route pattern: route groups like (app)
 * dropped, dynamic segments kept as "[param]".
 */
function pageRoutes(dir: string, root: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return pageRoutes(path, root);
    }
    if (name !== "page.tsx") {
      return [];
    }
    const segments = relative(root, dir)
      .split(sep)
      .filter((segment) => segment !== "" && !/^\(.+\)$/.test(segment));
    return [`/${segments.join("/")}`];
  });
}

// Not gated by design: the proxy's matcher never runs on /~offline (the
// service worker serves it offline), and /welcome is only reached through
// resolveRoute's rewrite of a signed-out "/".
const OUTSIDE_THE_GATE = ["/~offline", MARKETING_PATH];

test("every page is listed as public or protected, so none goes public by being forgotten", () => {
  const appDir = join(process.cwd(), "src/app");
  const listed = new Set<string>([...PUBLIC_ROUTES, ...PROTECTED_ROUTES, ...OUTSIDE_THE_GATE]);
  const unlisted = pageRoutes(appDir, appDir).filter((route) => !listed.has(route));
  expect(unlisted).toEqual([]);
});

test("every listed route is a real page, and none is both public and protected", () => {
  const appDir = join(process.cwd(), "src/app");
  const pages = new Set(pageRoutes(appDir, appDir));
  const stale = [...PUBLIC_ROUTES, ...PROTECTED_ROUTES].filter((route) => !pages.has(route));
  expect(stale).toEqual([]);
  const both = PUBLIC_ROUTES.filter((route) => (PROTECTED_ROUTES as readonly string[]).includes(route));
  expect(both).toEqual([]);
});
