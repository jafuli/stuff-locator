import { expect, test } from "vitest";
import { PUBLIC_PATHS, requiresAuth } from "@/lib/route-access";

// The routes the route-protection task's Acceptance Criteria named as
// protected, minus "/" — public since the marketing home (see the test
// below). Spelled out one per entry rather than generated, so the list is
// reviewable line by line.
const AC_PROTECTED_ROUTES = [
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

// AC #2: the auth pages (and "/") stay reachable without a session. A regression here
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

test('"/" is public on its own, but none of its children are', () => {
  // page.tsx shows a signed-out visitor the marketing home, so the proxy
  // must let "/" through — by equality, never as a prefix that would open
  // up the whole app.
  expect(requiresAuth("/")).toBe(false);
  expect(requiresAuth("/browse")).toBe(true);
  expect(requiresAuth("/items/new")).toBe(true);
  expect(requiresAuth("/activity")).toBe(true);
  expect(requiresAuth("/settings/invite")).toBe(true);
});
