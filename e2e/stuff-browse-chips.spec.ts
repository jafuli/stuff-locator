import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "./fixtures";
import { expectNoSeriousAxeViolations } from "./axe";
import { seedItem, seedLocationChain } from "./supabase-test-client";
import { tabUntilFocused } from "./utils";
import { STUFF_PATH } from "@/lib/routes";

// The All (n) / By place chips are the way into Browse (wireframes 02 / C1).
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-chips-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(STUFF_PATH);
  return email;
}

async function seedTwoItems(page: Page): Promise<{ tent: string; passport: string }> {
  const email = await signUpFreshAccount(page);
  const garage = await seedLocationChain(email, TEST_PASSWORD, ["Garage"]);
  const bedroom = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const tag = randomUUID().slice(0, 8);
  const tent = `Camping tent ${tag}`;
  const passport = `Passport ${tag}`;
  await seedItem(email, TEST_PASSWORD, { name: tent, locationId: garage });
  await seedItem(email, TEST_PASSWORD, { name: passport, locationId: bedroom });
  return { tent, passport };
}

test("the Stuff screen shows All (n) with the household total, current, and By place", async ({ page }) => {
  await seedTwoItems(page);
  await page.goto(STUFF_PATH);
  await page.waitForLoadState("networkidle");

  const all = page.getByRole("link", { name: "All (2)" });
  await expect(all).toBeVisible();
  await expect(all).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "By place" })).not.toHaveAttribute("aria-current", /.*/);
  // The v1 "Recent" chip is deliberately not here.
  await expect(page.getByRole("link", { name: "Recent" })).toHaveCount(0);
});

test("the count is the household total, not the search results", async ({ page }) => {
  const { tent } = await seedTwoItems(page);
  await page.goto(STUFF_PATH);
  await page.waitForLoadState("networkidle");

  await page.getByRole("searchbox", { name: "Search your stuff" }).fill(tent);
  await expect(page.getByText(tent)).toBeVisible();
  await expect(page.getByRole("link", { name: "All (2)" })).toBeVisible();
});

test("Stuff → By place → Browse → All → Stuff, by keyboard", async ({ page }) => {
  await seedTwoItems(page);
  await page.goto(STUFF_PATH);
  await page.waitForLoadState("networkidle");

  expect(await tabUntilFocused(page, "By place", 15)).toBe(true);
  await page.keyboard.press("Enter");

  await page.waitForURL("/browse");
  await expect(page.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeVisible();
  // Same header as Home, with By place now the current one.
  await expect(page.getByRole("link", { name: "By place" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "All (2)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Garage", exact: true })).toBeVisible();

  expect(await tabUntilFocused(page, "All (2)", 15)).toBe(true);
  await page.keyboard.press("Enter");

  await page.waitForURL(STUFF_PATH);
  await expect(page.getByRole("link", { name: "All (2)" })).toHaveAttribute("aria-current", "page");
});

test("typing in the search box on Browse searches right there, without leaving Browse", async ({ page }) => {
  const { tent, passport } = await seedTwoItems(page);
  await page.goto("/browse");
  const search = page.getByRole("searchbox", { name: "Search your stuff" });
  await expect(search).toBeEnabled();

  await search.fill("Camping");

  // The places give way to matching items; the route and the field stay put.
  await expect(page.getByText(tent)).toBeVisible();
  await expect(page.getByText(passport)).toHaveCount(0);
  // The place list (and its "+ Add a place here") is gone. "Garage" is still
  // a link, but only as the tent's breadcrumb.
  await expect(page.getByRole("button", { name: "+ Add a place here" })).toHaveCount(0);
  await expect(page).toHaveURL("/browse");
  await expect(search).toBeFocused();
  await expect(page.getByRole("link", { name: "By place" })).toHaveAttribute("aria-current", "page");

  // Clearing the field brings the places back.
  await search.fill("");
  await expect(page.getByRole("button", { name: "+ Add a place here" })).toBeVisible();
  await expect(page.getByText(tent)).toHaveCount(0);
});

test("switching All / By place keeps the same header: the search field is never replaced, and the query carries over", async ({
  page,
}) => {
  const { tent } = await seedTwoItems(page);
  await page.goto(STUFF_PATH);
  const search = page.getByRole("searchbox", { name: "Search your stuff" });
  await expect(search).toBeEnabled();
  const field = await search.elementHandle();

  await page.getByRole("link", { name: "By place" }).click();
  await page.waitForURL("/browse");
  await expect(page.getByRole("link", { name: "Garage", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All (2)" }).click();
  await page.waitForURL(STUFF_PATH);
  await expect(page.getByText(tent)).toBeVisible();

  // The very same element the whole time: the header never unmounted.
  expect(await field.evaluate((element) => element.isConnected)).toBe(true);
  expect(await search.evaluate((element, original) => element === original, field)).toBe(true);

  // A query typed on one view is still there on the other.
  await search.fill("Camping");
  await page.getByRole("link", { name: "By place" }).click();
  await page.waitForURL("/browse");
  await expect(search).toHaveValue("Camping");
  await expect(page.getByText(tent)).toBeVisible();
});

test.describe("slow connection", () => {
  test.use({ serviceWorkers: "block" });

  test("on a slow connection, tapping By place shows the list loading at once under the same header", async ({
    page,
  }) => {
    await seedTwoItems(page);
    // Every RSC request (prefetches included) takes 3s, so the tap lands
    // before Next has anything for /browse: the slow-network case. (The
    // service worker is blocked in this describe: page.route can't delay a
    // request the worker answers itself.)
    await page.route("**/*", async (route) => {
      if (route.request().headers().rsc === "1") {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      await route.continue();
    });
    await page.goto(STUFF_PATH);
    const search = page.getByRole("searchbox", { name: "Search your stuff" });
    await expect(search).toBeEnabled();

    await page.getByRole("link", { name: "By place" }).click();

    // Immediately, well inside the 3s delay: By place selected, the list
    // swapped for its skeleton, the search field disabled, the header intact.
    const quick = { timeout: 1000 };
    await expect(page.getByRole("link", { name: "By place" })).toHaveAttribute("aria-current", "page", quick);
    await expect(page.getByRole("status").filter({ hasText: "Loading…" })).toHaveCount(1, quick);
    await expect(search).toBeDisabled(quick);
    await expect(page.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeVisible(quick);
    await expect(page.getByRole("link", { name: "All (2)" })).toBeVisible(quick);
    // And Browse's own content isn't there yet: this really is the wait.
    await expect(page.getByRole("button", { name: "+ Add a place here" })).toHaveCount(0);

    // Then Browse arrives.
    await page.waitForURL("/browse", { timeout: 15_000 });
    await expect(page.getByRole("link", { name: "Garage", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(search).toBeEnabled();
  });
});

test("sub-pages keep their Back link and do not show the chips", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const garage = await seedLocationChain(email, TEST_PASSWORD, ["Garage"]);
  await page.goto(`/browse/${garage}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("link", { name: "‹ Back to Browse" })).toBeVisible();
  await expect(page.getByRole("link", { name: "By place" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Stuff view" })).toHaveCount(0);
});

test("chips are comfortable touch targets and the page doesn't scroll sideways at 320px", async ({ page }) => {
  await seedTwoItems(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(STUFF_PATH);
  await page.waitForLoadState("networkidle");

  for (const name of ["All (2)", "By place"]) {
    const box = await page.getByRole("link", { name }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Home and the top of Browse have no critical or serious axe violations with the chips", async ({ page }) => {
  await seedTwoItems(page);

  for (const path of [STUFF_PATH, "/browse"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoSeriousAxeViolations(page, path);
  }
});

test("the bottom nav keeps Stuff selected on Browse and inside a place, but not on an item's page", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const placeId = await seedLocationChain(email, TEST_PASSWORD, ["Garage"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Camping tent", locationId: placeId });
  const stuffTab = page.getByRole("navigation").getByRole("link", { name: "Stuff" });

  for (const path of ["/browse", `/browse/${placeId}`]) {
    await page.goto(path);
    await expect(stuffTab).toHaveAttribute("aria-current", "page");
  }

  await page.goto(`/items/${itemId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Camping tent" })).toBeVisible();
  await expect(stuffTab).not.toHaveAttribute("aria-current", "page");
});

test("the top of Browse has the same Stash button as the Stuff screen, and it opens Stash", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/browse");

  const stash = page.getByRole("link", { name: "Stash", exact: true });
  await expect(stash).toBeVisible();
  await stash.click();
  await page.waitForURL("/items/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add an item" })).toBeVisible();
});
