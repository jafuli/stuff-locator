import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { seedItem, seedLocationChain } from "./supabase-test-client";
import { tabUntilFocused } from "./utils";

// Item detail (/items/[id]) now reads real household data — every test
// signs up a fresh real account first (the route redirects an
// unauthenticated visitor to /sign-in) and seeds a real location/item via
// the service-role client, matching the account-per-test pattern already
// established in stash.spec.ts / browse.spec.ts.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-item-detail-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

test("item-detail shows the item's full detail", async ({ page }) => {
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
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, {
    name: "Passport",
    detail: "with the birth certificates",
    locationId,
  });

  await page.goto(`/items/${itemId}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Passport" })).toBeVisible();
  await expect(page.getByText("Bedroom › Filing box")).toBeVisible();
  await expect(page.getByText("with the birth certificates")).toBeVisible();
  await expect(page.getByRole("link", { name: "‹ Back to Stuff" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("the detail page's back link is keyboard-reachable", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet", "Toolbox", "Red box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Spare house keys", locationId });

  await page.goto(`/items/${itemId}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Spare house keys" })).toBeVisible();
  expect(await tabUntilFocused(page, "‹ Back to Stuff")).toBe(true);
});

test("an unknown item id renders the not-found state, not a raw crash", async ({ page }) => {
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
  // Not a valid uuid at all — exercises the malformed-id branch (Postgres
  // 22P02) folded into the same not-found state as a well-formed but
  // nonexistent id, rather than crashing into error.tsx.
  await page.goto("/items/does-not-exist");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Item not found")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Stuff" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

// Regression: item detail used to render items.added_by straight through,
// so a real user saw "Added by 7b1d8b20-b71e-4cfe-b429-176c7cb25f38".
// Display names come from the profiles table now — see
// supabase/migrations/20260927120000_profiles_and_display_names.sql.
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

test("item detail names the person who added the item, never their raw user id", async ({ page }) => {
  // Deliberately dash-free unique suffix: the usual `${randomUUID()}` in a
  // test email or item name is itself uuid-shaped, which would make the
  // "no uuid on the page" assertion below pass or fail for the wrong
  // reason.
  const suffix = randomUUID().replace(/-/g, "");
  const localPart = `e2e-added-by-${suffix}`;
  const email = `${localPart}@example.com`;

  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");

  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Garage"]);
  const itemName = `Spare keys ${suffix}`;
  const itemId = await seedItem(email, TEST_PASSWORD, { name: itemName, locationId });

  await page.goto(`/items/${itemId}`);
  await expect(page.getByRole("heading", { level: 1, name: itemName })).toBeVisible();

  // The profiles trigger seeds display_name from the email's local-part.
  await expect(page.getByText("Added by").locator("xpath=following-sibling::*[1]")).toHaveText(localPart);

  // The actual regression guard: no user id anywhere in the rendered
  // page. The item's own id is in the URL, deliberately, but must not
  // leak into the body.
  const body = await page.locator("main").innerText();
  expect(body).not.toMatch(UUID_PATTERN);
});
