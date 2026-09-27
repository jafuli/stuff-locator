import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { seedItem, seedLocationChain } from "./supabase-test-client";

// Runs against a real local Supabase stack — see sign-up.spec.ts's header
// comment. Proves the gate in src/proxy.ts both ways: every route the
// task's Acceptance Criteria lists bounces a signed-out visitor to
// /sign-in, and a real session reaches the real page.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-route-protection-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

// A syntactically valid id that resolves to nothing. Fine for the
// signed-out half: the redirect happens in the proxy, before the page
// ever runs a query, so what the id points at is irrelevant there.
const UNRESOLVABLE_ID = "2a4e6c9b-0000-4000-8000-000000000001";

// AC #1's list, exactly. `next` is what the proxy should preserve —
// null for "/", which is the default landing spot and needs no param.
const PROTECTED_ROUTES: { path: string; next: string | null }[] = [
  { path: "/", next: null },
  { path: "/browse", next: "/browse" },
  { path: `/browse/${UNRESOLVABLE_ID}`, next: `/browse/${UNRESOLVABLE_ID}` },
  { path: `/items/${UNRESOLVABLE_ID}`, next: `/items/${UNRESOLVABLE_ID}` },
  { path: `/items/${UNRESOLVABLE_ID}/edit`, next: `/items/${UNRESOLVABLE_ID}/edit` },
  { path: "/items/new", next: "/items/new" },
  { path: "/locations/new", next: "/locations/new" },
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
    { path: "/", heading: /Our stuff/ },
    { path: "/browse", heading: /Browse/ },
    { path: `/browse/${locationId}`, heading: /Toolbox/ },
    { path: `/items/${itemId}`, heading: /Spare keys/ },
    { path: `/items/${itemId}/edit`, heading: /Edit item/ },
    { path: "/items/new", heading: /Add an item/ },
    { path: "/locations/new", heading: /Add a location/ },
    { path: "/activity", heading: /Activity/ },
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

  await page.getByRole("button", { name: "Sign out" }).click();
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

  await page.getByLabel("Email").fill(`e2e-route-protection-${randomUUID()}@example.com`);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("/browse");
  await expect(page.getByRole("heading", { level: 1, name: /Browse/ })).toBeVisible();
});

test("a ?next= pointing off-origin is ignored rather than followed", async ({ page }) => {
  // The open-redirect case: the param is just a query string on a public
  // page, so anyone can craft this link. Signing in must land on "/",
  // not on the attacker's host.
  const email = await signUpFreshAccount(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/sign-in");

  await page.goto("/sign-in?next=https://evil.example/phish");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();
});

test("the invite landing stays reachable without an account", async ({ page }) => {
  // Its entire audience is people who don't have an account yet, so this
  // is the one non-auth route that must NOT be gated.
  await page.goto("/join/some-code-that-does-not-resolve");
  expect(new URL(page.url()).pathname).toBe("/join/some-code-that-does-not-resolve");
  await expect(page.getByRole("heading", { level: 1, name: "Join a household" })).toBeVisible();
});
