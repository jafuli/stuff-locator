import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { tabUntilFocused } from "./utils";

// Stash (/items/new) is fixture-only — there is no backend call anywhere in
// this flow, and a successful "add" is never written back into the fixture
// item list. None of these tests assert the captured item shows up on
// Home/Browse/Find afterward, by design (see the PR description) — that's
// deliberately out of scope here, not an oversight.
const TEST_PASSWORD = "correct-horse-battery-1";

// Only the happy-path test below needs this: it navigates back to "/" at
// the end, and Home now reads real household data and redirects an
// unauthenticated visitor to /sign-in instead (see home.spec.ts). The other
// tests in this file never leave /items/new, so they're unaffected and
// left unauthenticated on purpose.
async function signUpFreshAccount(page: Page): Promise<void> {
  const email = `e2e-stash-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
}

test("filling a valid name, an existing location via the autocomplete, and an optional detail succeeds with the exact captured values", async ({
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

  await signUpFreshAccount(page);
  await page.goto("/items/new");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Add an item" })).toBeVisible();

  await page.getByLabel("Name").fill("Bike pump");

  await page.getByRole("combobox").fill("Red box");
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox › Red box" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Selected: Garage › Closet › Toolbox › Red box")).toBeVisible();

  await page.getByLabel("Detail (optional)").fill("Top shelf, behind the shoebox");
  await page.getByRole("button", { name: "Add item" }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText("Bike pump", { exact: true })).toBeVisible();
  await expect(status.getByText("Garage › Closet › Toolbox › Red box")).toBeVisible();
  await expect(status.getByText("Top shelf, behind the shoebox")).toBeVisible();

  await status.getByRole("link", { name: "Back to home" }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("submitting with an empty name and no location shows specific inline errors and never navigates away", async ({
  page,
}) => {
  await page.goto("/items/new");

  await page.getByRole("button", { name: "Add item" }).click();

  await expect(page.getByText("Enter a name for this item.")).toBeVisible();
  await expect(page.getByText("Choose a location for this item.")).toBeVisible();
  await expect(page).toHaveURL(/\/items\/new$/);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a location that's typed but never resolved to an existing place is rejected with its own specific message", async ({
  page,
}) => {
  await page.goto("/items/new");

  await page.getByLabel("Name").fill("Mystery gadget");
  await page.getByRole("combobox").fill("Attic");
  await page.keyboard.press("ArrowDown");
  // Only the "+ New place called…" row exists for a query with no match —
  // this selects it, exactly like a user who typed a place that isn't in
  // the list yet and picked the only row on offer.
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add item" }).click();

  await expect(
    page.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/items\/new$/);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("the whole form, including the autocomplete, is operable keyboard-only", async ({ page }) => {
  await page.goto("/items/new");

  await page.getByLabel("Name").focus();
  await expect(page.getByLabel("Name")).toBeFocused();
  // A small per-key delay — real keystrokes need it for a controlled input
  // this reactive (downshift re-filters and re-renders the option list on
  // every keystroke); firing them at Playwright's default zero delay drops
  // and reorders characters.
  await page.keyboard.type("Passport", { delay: 20 });

  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.type("Red box", { delay: 20 });
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox › Red box" })).toBeVisible();

  // Escape closes the menu without leaving the field.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByRole("combobox")).toBeFocused();

  // Reopen with the arrow key, arrow onto the match, select it.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox › Red box" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Selected: Garage › Closet › Toolbox › Red box")).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Detail (optional)")).toBeFocused();
  await page.keyboard.type("Top drawer", { delay: 20 });

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Add item" })).toBeFocused();
  await page.keyboard.press("Enter");

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText("Passport")).toBeVisible();
  await expect(status.getByText("Garage › Closet › Toolbox › Red box")).toBeVisible();

  // The "Back to home" link is still reachable without leaving the keyboard.
  expect(await tabUntilFocused(page, "Back to home", 5)).toBe(true);
});
