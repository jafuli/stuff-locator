import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { seedItem, seedLocationChainAllIds } from "./supabase-test-client";
import { tabUntilFocused } from "./utils";

const TEST_PASSWORD = "correct-horse-battery-1";

// /activity reads the signed-in household's real items (it was the last
// fixture-backed route). The actor shown is the profile display name, which
// for an email sign-up is the local part of the address.
async function signUpFreshAccount(page: Page): Promise<{ email: string; displayName: string }> {
  const displayName = `e2e-activity-${randomUUID()}`;
  const email = `${displayName}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return { email, displayName };
}

test("a household with nothing stashed shows the empty state, not fixture entries", async ({ page }) => {
  await signUpFreshAccount(page);

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  await expect(page.getByText("Nothing has happened yet")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(0);
});

test("a stashed item appears as '<name> added <item>' with its real breadcrumb, and links out correctly", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  const { email, displayName } = await signUpFreshAccount(page);
  const [garageId, closetId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Garage", "Closet"]);
  const itemName = `Spare house keys ${randomUUID()}`;
  const itemId = await seedItem(email, TEST_PASSWORD, { name: itemName, locationId: closetId });

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  await expect(page.getByText("Nothing has happened yet")).toHaveCount(0);

  const entry = page.getByRole("listitem").first();
  // The person's display name, never a raw user id.
  await expect(entry.getByText(displayName, { exact: true })).toBeVisible();
  await expect(entry.getByText("added", { exact: true })).toBeVisible();
  await expect(entry.getByRole("link", { name: itemName })).toHaveAttribute("href", `/items/${itemId}`);

  // Breadcrumb segments link to the matching /browse/[id] — real ids now.
  await expect(entry.getByRole("link", { name: "Garage" })).toHaveAttribute("href", `/browse/${garageId}`);
  await expect(entry.getByRole("link", { name: "Closet" })).toHaveAttribute("href", `/browse/${closetId}`);

  expect(consoleErrors).toEqual([]);
});

test("an activity feed entry's item link is keyboard-reachable", async ({ page }) => {
  const { email } = await signUpFreshAccount(page);
  const locationId = (await seedLocationChainAllIds(email, TEST_PASSWORD, ["Garage"]))[0];
  const itemName = `Tent ${randomUUID()}`;
  await seedItem(email, TEST_PASSWORD, { name: itemName, locationId });

  await page.goto("/activity");
  // tabUntilFocused presses Tab with no polling, so make sure the real feed
  // has rendered (and the page has settled) before the first press —
  // otherwise a slow CI run can burn Tab presses on an unsettled page.
  await expect(page.getByRole("link", { name: itemName })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await tabUntilFocused(page, itemName, 20)).toBe(true);
});
