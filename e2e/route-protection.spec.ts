import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { seedItem, seedLocationChain } from "./supabase-test-client";
import { signOutViaMenu } from "./utils";
import { MARKETING_PATH, STUFF_PATH } from "@/lib/routes";

// Runs against a real local Supabase stack — see sign-up.spec.ts's header
// comment. Proves the gate in src/proxy.ts both ways: every route the
// task's Acceptance Criteria lists bounces a signed-out visitor to
// /sign-in, and a real session reaches the real page.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-route-protection-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(STUFF_PATH);
  return email;
}

// A syntactically valid id that resolves to nothing. Fine for the
// signed-out half: the redirect happens in the proxy, before the page
// ever runs a query, so what the id points at is irrelevant there.
const UNRESOLVABLE_ID = "2a4e6c9b-0000-4000-8000-000000000001";

// AC #1's list, with the Stuff screen at STUFF_PATH ("/" is the public
// marketing home — see the tests after the loop). `next` is what the proxy
// should preserve.
const PROTECTED_ROUTES: { path: string; next: string }[] = [
  { path: STUFF_PATH, next: STUFF_PATH },
  { path: "/browse", next: "/browse" },
  { path: `/browse/${UNRESOLVABLE_ID}`, next: `/browse/${UNRESOLVABLE_ID}` },
  { path: `/items/${UNRESOLVABLE_ID}`, next: `/items/${UNRESOLVABLE_ID}` },
  { path: `/items/${UNRESOLVABLE_ID}/edit`, next: `/items/${UNRESOLVABLE_ID}/edit` },
  { path: "/items/new", next: "/items/new" },
  { path: "/activity", next: "/activity" },
];

for (const route of PROTECTED_ROUTES) {
  test(`signed out, ${route.path} redirects to /sign-in`, async ({ page }) => {
    await page.goto(route.path);

    const url = new URL(page.url());
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("next")).toBe(route.next);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  });
}

test("signed out, / shows the marketing home without the app's nav", async ({ page }) => {
  await page.goto(MARKETING_PATH);

  expect(new URL(page.url()).pathname).toBe(MARKETING_PATH);
  await expect(page.getByRole("heading", { level: 1, name: "Where did we put the passports?" })).toBeVisible();
  // "/" is (public)/page.tsx, in the (public) route group: the nav isn't
  // hidden, it was never rendered.
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
});

test("signed in, / redirects to the Stuff screen and keeps the query string", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  // One item, so the Stuff screen shows its search box rather than onboarding.
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Hallway"]);
  await seedItem(email, TEST_PASSWORD, { name: `Spare keys ${randomUUID()}`, locationId });

  await page.goto(`${MARKETING_PATH}?q=keys`);
  await expect(page).toHaveURL(`${STUFF_PATH}?q=keys`);
  await expect(page.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeVisible();
  // The Stuff screen no longer applies ?q= (the search lives in the shared
  // header and starts empty), so only the redirect itself is checked here.
  await expect(page.getByRole("searchbox", { name: "Search your stuff" })).toHaveValue("");
});

test("signed in, an unknown URL shows the standalone 404, and its wordmark goes back to Stuff", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/no-such-page");

  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeAttached();
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);

  // The wordmark goes to the site root, which sends a signed-in visitor on to Stuff.
  await page.getByRole("banner").getByRole("link", { name: "Stuff Locator" }).click();
  await expect(page).toHaveURL(STUFF_PATH);
  await expect(page.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
});

test("signed out, the marketing home's Sign up and Sign in links land on their pages", async ({ page }) => {
  await page.goto(MARKETING_PATH);
  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/sign-up");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  await page.goto(MARKETING_PATH);
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});

// AC #2. A regression here locks everyone out of the app, including out
// of the ability to get back in, so it's asserted rather than assumed.
for (const path of ["/sign-in", "/sign-up", "/forgot-password", "/reset-password"]) {
  test(`signed out, ${path} is still reachable`, async ({ page }) => {
    await page.goto(path);
    expect(new URL(page.url()).pathname).toBe(path);
  });
}

test("signed in, every protected route reaches its real page", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  // Real ids this time — a signed-in visitor gets past the proxy and the
  // page actually runs its query, so /items/[id] needs an item that
  // exists in this account's household.
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Toolbox"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: `Spare keys ${randomUUID()}`, locationId });

  const routes: { path: string; heading: RegExp }[] = [
    { path: STUFF_PATH, heading: /What are you looking for\?/ },
    { path: "/browse", heading: /What are you looking for\?/ },
    { path: `/browse/${locationId}`, heading: /Toolbox/ },
    { path: `/items/${itemId}`, heading: /Spare keys/ },
    { path: `/items/${itemId}/edit`, heading: /Edit item/ },
    { path: "/items/new", heading: /Add an item/ },
    { path: "/activity", heading: /What did you miss\?/ },
  ];

  for (const route of routes) {
    await page.goto(route.path);
    expect(new URL(page.url()).pathname, `${route.path} should not have redirected`).toBe(route.path);
    await expect(page.getByRole("heading", { level: 1, name: route.heading })).toBeVisible();
  }
});

test("the return-to path survives sign-in, so a shared link lands where it pointed", async ({ page }) => {
  // Make an account, seed an item into it, then sign out and try to open
  // the item cold — the shape of a partner following a shared link.
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemName = `Passport ${randomUUID()}`;
  const itemId = await seedItem(email, TEST_PASSWORD, { name: itemName, locationId });

  await signOutViaMenu(page);
  await page.waitForURL("/sign-in");

  await page.goto(`/items/${itemId}`);
  await expect(page).toHaveURL(`/sign-in?next=%2Fitems%2F${itemId}`);

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL(`/items/${itemId}`);
  await expect(page.getByRole("heading", { level: 1, name: itemName })).toBeVisible();
});

test("the return-to path also survives choosing 'sign up' instead", async ({ page }) => {
  await page.goto("/browse");
  await expect(page).toHaveURL("/sign-in?next=%2Fbrowse");

  await page.getByRole("link", { name: "Sign up" }).click();
  await expect(page).toHaveURL("/sign-up?next=%2Fbrowse");

  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByLabel("Email").fill(`e2e-route-protection-${randomUUID()}@example.com`);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("/browse");
  // Browse's top level shares Home's header; By place being the current chip
  // is what says this is Browse and not Home.
  await expect(page.getByRole("link", { name: "By place" })).toHaveAttribute("aria-current", "page");
});

test("a ?next= pointing off-origin is ignored rather than followed", async ({ page }) => {
  // The open-redirect case: the param is just a query string on a public
  // page, so anyone can craft this link. Signing in must land on the Stuff
  // screen, not on the attacker's host.
  const email = await signUpFreshAccount(page);
  await signOutViaMenu(page);
  await page.waitForURL("/sign-in");

  await page.goto("/sign-in?next=https://evil.example/phish");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL(STUFF_PATH);
  await expect(page.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeVisible();
});

test("the invite landing stays reachable without an account", async ({ page }) => {
  // Its entire audience is people who don't have an account yet, so this
  // is the one non-auth route that must NOT be gated.
  await page.goto("/join/some-code-that-does-not-resolve");
  expect(new URL(page.url()).pathname).toBe("/join/some-code-that-does-not-resolve");
  await expect(page.getByRole("heading", { level: 1, name: "Join a household" })).toBeVisible();
});

test("a link to / prefetched while signed out still opens Stuff once a session exists", async ({ page, context }) => {
  // The shape of the join flow: a public page prefetches "/" (the wordmark
  // link) while signed out, then the visitor gets a session without a router
  // refresh, then follows that link. "/" still answers differently by cookie
  // (the marketing home, or a redirect to the Stuff screen), so the
  // signed-out prefetch must not be reused: (public)/page.tsx renders per
  // request (connection()) for exactly this reason.
  await page.goto("/forgot-password");
  await page.waitForLoadState("networkidle");

  const other = await context.newPage();
  await signUpFreshAccount(other);
  await other.close();

  await page.getByRole("banner").getByRole("link", { name: "Stuff Locator" }).click();
  await expect(page).toHaveURL(STUFF_PATH);
  await expect(page.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeVisible();
});
