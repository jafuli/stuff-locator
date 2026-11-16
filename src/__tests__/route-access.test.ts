import { expect, test } from "vitest";
import { PUBLIC_PATHS, requiresAuth, resolveRoute } from "@/lib/route-access";

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

test("routes the AC doesn't enumerate are still protected, because the rule is deny-by-default", () => {
  // /settings/invite reads real household data and is not in the AC's
  // list; the point of an allowlist is that it's covered anyway.
  expect(requiresAuth("/settings/invite")).toBe(true);
  expect(requiresAuth("/~components")).toBe(true);
  expect(requiresAuth("/some/route/nobody/has/written/yet")).toBe(true);
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

test("a path that merely starts with a public path's name is still protected", () => {
  // "/sign-innocuous" shares a prefix with "/sign-in" — an allowlist built
  // on startsWith instead of equality would wave it through.
  expect(requiresAuth("/sign-innocuous")).toBe(true);
  expect(requiresAuth("/joined")).toBe(true);
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
