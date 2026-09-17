import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { seedItem, seedLocationChain } from "./supabase-test-client";
import { tabUntilFocused } from "./utils";

// Home now reads real household data (see the PR description) instead of
// the ITEMS/LOCATIONS fixtures — every test signs up a fresh real account
// first (the route redirects an unauthenticated visitor to /sign-in), then
// seeds a real item via the service-role client for the tests that need
// one to render. Matches the account-per-test pattern already established
// in sign-in.spec.ts / sign-up.spec.ts / stash.spec.ts.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-home-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

test("home route boots cleanly, shows a real item, and is keyboard-reachable", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  const email = await signUpFreshAccount(page);
  const itemName = `Spare key ${randomUUID()}`;
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet"]);
  await seedItem(email, TEST_PASSWORD, { name: itemName, locationId });

  await page.goto("/");
  // next/link prefetches in-viewport links shortly after paint, not
  // synchronously with navigation — waiting for network idle before
  // asserting on consoleErrors below is what actually catches that class of
  // bug (e.g. a link pointing at a route that 404s on prefetch), instead of
  // racing ahead of it.
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search your stuff" })).toBeVisible();
  await expect(page.getByText(itemName)).toBeVisible();
  await expect(page.getByText("Garage › Closet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Stuff" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();

  expect(await tabUntilFocused(page, "Activity", 40)).toBe(true);

  expect(consoleErrors).toEqual([]);
});

test("a real item's breadcrumb segment links to the correct /browse/[id] — Browse's own rendering is out of scope here", async ({
  page,
}) => {
  // This only checks the href Home generates, not what Browse does with
  // it — Browse is still fixture-only (a separate wiring task, this task's
  // AC #6) and has no way to render a real household's location, so
  // navigating into it and asserting content isn't something this task can
  // honestly test (see browse.spec.ts's comment where this test used to
  // partly live, before Home read real data).
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  await seedItem(email, TEST_PASSWORD, { name: `Passport ${randomUUID()}`, locationId });

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("link", { name: "Filing box" })).toHaveAttribute("href", `/browse/${locationId}`);
});

test("a brand-new household with zero items shows guided onboarding, not the plain empty state", async ({ page }) => {
  // The plain "No items yet" empty state is still real — see
  // guided-onboarding.spec.ts's "skip path" test, which reaches it by
  // completing onboarding with zero items added. A genuinely never-
  // onboarded household sees the guided sequence first (see that task's
  // own PR description for why: Home replaces the empty state with it,
  // not the whole page).
  await signUpFreshAccount(page);

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();
  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stash something filed away" })).toBeVisible();
  await expect(page.getByText("No items yet")).toHaveCount(0);
});

test("home has a visible, keyboard-reachable entry point into the Stash flow", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const addItemLink = page.getByRole("link", { name: "+ Add item" });
  await expect(addItemLink).toBeVisible();

  // It's one of the very first tab stops on the page, right beside the h1.
  expect(await tabUntilFocused(page, "+ Add item", 5)).toBe(true);

  await addItemLink.click();
  await page.waitForURL("/items/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add an item" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
