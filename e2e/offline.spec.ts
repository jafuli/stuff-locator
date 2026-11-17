import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { PRIVATE_CACHE_NAMES } from "../src/lib/offline/cache-policy";
import { seedItem, seedLocationChain } from "./supabase-test-client";
import { signOutViaMenu } from "./utils";

// Selects root layout.tsx's own scroll container by its class
// (`flex-1 overflow-y-auto`, the only element in the app with that class —
// see layout.tsx) rather than adding a data-testid, to keep this fix's diff
// scoped to the one-line sizing change it's actually about.
async function scrollSlack(page: Page): Promise<number> {
  return page.evaluate(() => {
    const container = document.querySelector(".overflow-y-auto");
    if (!container) {
      throw new Error("Expected root layout's scroll container (.overflow-y-auto) to exist");
    }
    return container.scrollHeight - container.clientHeight;
  });
}

for (const viewport of [
  { name: "a short viewport", width: 320, height: 568 },
  { name: "a tall viewport", width: 1280, height: 1024 },
]) {
  test(`/~offline introduces no extra scrollable slack under the fixed nav shell (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/~offline");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { level: 1, name: "You're offline" })).toBeVisible();

    // 1px tolerance for sub-pixel rounding, matching the fix's own AC.
    expect(await scrollSlack(page)).toBeLessThanOrEqual(1);

    // No horizontal overflow either (unchanged requirement).
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
}

// The caching policy for signed-in data (docs/adr/0014). These run against
// the production build Playwright starts (playwright.config.ts), the only
// place the service worker caches anything.

const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpWithItem(page: Page): Promise<{ itemId: string; itemName: string }> {
  const email = `e2e-offline-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");

  // A name no other page or test could contain, so finding it in a cached
  // body can only mean this household's data.
  const itemName = `Passport ${randomUUID().slice(0, 8)}`;
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Desk"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: itemName, locationId });
  return { itemId, itemName };
}

/** Loads the Stuff screen under the service worker's control. */
async function openStuffControlled(page: Page): Promise<void> {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // The first load registers the worker; it only controls pages loaded after.
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.waitForLoadState("networkidle");
}

/** Opens the item from the Stuff screen and comes back, the way a person checks something. */
async function visitItemAndReturn(page: Page, itemName: string): Promise<void> {
  await page.getByRole("link", { name: new RegExp(itemName) }).click();
  await expect(page.getByRole("heading", { level: 1, name: itemName })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeVisible();
  await page.waitForLoadState("networkidle");
}

/** Every cached request URL and body in the private caches that mentions `needle`. */
async function privateCacheHits(page: Page, needle: string): Promise<string[]> {
  return page.evaluate(
    async ({ names, needle }) => {
      const hits: string[] = [];
      for (const name of names) {
        if (!(await caches.has(name))) {
          continue;
        }
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
          const body = (await (await cache.match(request))?.text()) ?? "";
          if (request.url.includes(needle) || body.includes(needle)) {
            hits.push(`${name}: ${request.url}`);
          }
        }
      }
      return hits;
    },
    { names: [...PRIVATE_CACHE_NAMES], needle },
  );
}

test("signing out empties the household-data caches, so offline shows nothing of the last household", async ({
  page,
  context,
}) => {
  const { itemId, itemName } = await signUpWithItem(page);
  await openStuffControlled(page);
  await visitItemAndReturn(page, itemName);

  // The baseline: offline browsing works because the household is cached.
  await expect.poll(() => privateCacheHits(page, itemName)).not.toEqual([]);

  await signOutViaMenu(page);
  await page.waitForURL(/\/sign-in/);
  await page.waitForLoadState("networkidle");

  expect(await privateCacheHits(page, itemName)).toEqual([]);
  expect(await privateCacheHits(page, itemId)).toEqual([]);
  // The app shell stays, so the offline page itself still works.
  const cacheNames = await page.evaluate(() => caches.keys());
  expect(cacheNames.some((name) => name.startsWith("serwist-precache"))).toBe(true);

  await context.setOffline(true);
  for (const path of ["/", `/items/${itemId}`]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: "You're offline" })).toBeVisible();
    await expect(page.getByText(itemName)).toHaveCount(0);
  }
  await context.setOffline(false);
});

test("offline mid-session, search still works and a visited item still opens", async ({ page, context }) => {
  const { itemName } = await signUpWithItem(page);
  await openStuffControlled(page);
  await visitItemAndReturn(page, itemName);

  await context.setOffline(true);

  await page.getByRole("searchbox", { name: "Search your stuff" }).fill("passport");
  const result = page.getByRole("link", { name: new RegExp(itemName) });
  await expect(result).toBeVisible();

  await result.click();
  await expect(page.getByRole("heading", { level: 1, name: itemName })).toBeVisible();
  await expect(page.getByText("Bedroom › Desk")).toBeVisible();

  await context.setOffline(false);
});
