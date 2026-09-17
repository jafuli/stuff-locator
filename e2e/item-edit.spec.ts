import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { seedItem, seedLocationChain } from "./supabase-test-client";
import { tabUntilFocused, tabUntilHrefFocused } from "./utils";

// Edit item (/items/[id]/edit) now makes real Supabase writes — every test
// signs up a fresh real account first (the route redirects an
// unauthenticated visitor to /sign-in) and seeds real locations/items via
// the service-role client, matching the account-per-test pattern already
// established in stash.spec.ts / item-detail.spec.ts.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-item-edit-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

test("has a visible, keyboard-reachable entry point from item detail", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}`);
  const editLink = page.getByRole("link", { name: "Edit" });
  await expect(editLink).toBeVisible();
  expect(await tabUntilHrefFocused(page, `/items/${itemId}/edit`, 10)).toBe(true);

  await editLink.click();
  await page.waitForURL(`/items/${itemId}/edit`);
  await expect(page.getByRole("heading", { level: 1, name: "Edit item" })).toBeVisible();
});

test("the form is pre-filled with the item's current values", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, {
    name: "Passport",
    detail: "with the birth certificates",
    locationId,
  });

  await page.goto(`/items/${itemId}/edit`);

  await expect(page.getByLabel("Name")).toHaveValue("Passport");
  await expect(page.getByLabel("Detail (optional)")).toHaveValue("with the birth certificates");
  await expect(page.getByText("Selected: Bedroom › Filing box")).toBeVisible();
});

test("changing only name/detail persists via a plain update, leaving the location unchanged", async ({ page }) => {
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
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}/edit`);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Name").fill("Passport (renewed)");
  await page.getByLabel("Detail (optional)").fill("with the new passport photos");
  await page.getByRole("button", { name: "Save changes" }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText("Passport (renewed)", { exact: true })).toBeVisible();
  await expect(status.getByText("Bedroom › Filing box")).toBeVisible();
  await expect(status.getByText("with the new passport photos")).toBeVisible();

  await status.getByRole("link", { name: "Back to item" }).click();
  await page.waitForURL(`/items/${itemId}`);

  expect(consoleErrors).toEqual([]);
});

test("changing the location exercises the real move_item RPC, showing the new full breadcrumb path", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet", "Toolbox", "Red box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}/edit`);
  await page.waitForLoadState("networkidle");

  await page.getByRole("combobox").fill("Red box");
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox › Red box" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Selected: Garage › Closet › Toolbox › Red box")).toBeVisible();

  await page.getByRole("button", { name: "Save changes" }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText("Garage › Closet › Toolbox › Red box")).toBeVisible();

  // Real persistence, not a UI echo — the item now genuinely reads back
  // from its new location on a fresh page load.
  await page.goto(`/items/${itemId}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Garage › Closet › Toolbox › Red box")).toBeVisible();
});

test("submitting with an empty name shows a specific inline error and never navigates away", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}/edit`);

  await page.getByLabel("Name").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Enter a name for this item.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${itemId}/edit$`));
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("no location resolved (typed but never selected) is rejected with its own specific message", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}/edit`);

  await page.getByRole("combobox").fill("Attic");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(
    page.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${itemId}/edit$`));
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("delete requires confirmation: cancel leaves the item unchanged, confirm performs a real delete with a path to Home", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}/edit`);

  await page.getByRole("button", { name: "Delete item" }).click();
  await expect(page.getByRole("heading", { name: "Delete this item?" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Delete this item?" })).toHaveCount(0);
  await expect(page.getByLabel("Name")).toHaveValue("Passport");

  await page.getByRole("button", { name: "Delete item" }).click();
  await page.getByRole("button", { name: "Delete item" }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText("Passport", { exact: true })).toBeVisible();

  await status.getByRole("link", { name: "Back to home" }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();

  // Real deletion, not a UI-only echo — revisiting the item's own url now
  // 404s instead of resolving.
  await page.goto(`/items/${itemId}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Item not found")).toBeVisible();
});

test("the whole edit form, including delete confirmation, is operable keyboard-only", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet", "Toolbox", "Red box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}/edit`);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Name").focus();
  await expect(page.getByLabel("Name")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox")).toBeFocused();
  // A small per-key delay — real keystrokes need it for a controlled input
  // this reactive (downshift re-filters and re-renders on every keystroke).
  await page.keyboard.type("Red box", { delay: 20 });
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox › Red box" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Selected: Garage › Closet › Toolbox › Red box")).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Detail (optional)")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Delete item" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Delete this item?" })).toBeVisible();
  expect(await tabUntilFocused(page, "Cancel", 5)).toBe(true);
  expect(await tabUntilFocused(page, "Delete item", 5)).toBe(true);
  await page.keyboard.press("Enter");

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  expect(await tabUntilHrefFocused(page, "/", 5)).toBe(true);
});
