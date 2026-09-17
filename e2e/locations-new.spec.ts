import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { seedLocationChain } from "./supabase-test-client";
import { tabUntilFocused, tabUntilHrefFocused } from "./utils";

// Add-location (/locations/new) now makes a real Supabase write (see the PR
// description) — every test signs up a fresh real account first (the route
// redirects an unauthenticated visitor to /sign-in, and add-location-form.tsx
// needs a real household_id from the signed-in session), matching the
// account-per-test pattern already established in stash.spec.ts. The
// happy-path and keyboard tests additionally seed a real "Garage > Closet >
// Toolbox" location chain into that household via the service-role client,
// since the autocomplete now reads real rows instead of the LOCATIONS
// fixture.
//
// This location still won't show up on Browse/Home/Stash afterward — those
// routes are still fixture-backed until their own real-data-wiring tasks
// land (see this task's own AC #5) — that's deliberately out of scope here,
// not an oversight.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-locations-new-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

test("has a visible, keyboard-reachable entry point from Browse", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/browse");
  const addLocationLink = page.getByRole("link", { name: "+ Add location" });
  await expect(addLocationLink).toBeVisible();
  expect(await tabUntilHrefFocused(page, "/locations/new", 10)).toBe(true);

  await addLocationLink.click();
  await page.waitForURL("/locations/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add a location" })).toBeVisible();
});

test("filling a name and picking an existing parent succeeds with a real persisted row, showing the full breadcrumb path", async ({
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

  const email = await signUpFreshAccount(page);
  await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet", "Toolbox"]);

  await page.goto("/locations/new");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Name").fill("Spare batteries");

  await page.getByRole("combobox").fill("Toolbox");
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox", exact: true })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Selected: Garage › Closet › Toolbox")).toBeVisible();

  await page.getByRole("button", { name: "Add location" }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText("Spare batteries", { exact: true })).toBeVisible();
  await expect(status.getByText("Garage › Closet › Toolbox › Spare batteries")).toBeVisible();

  await status.getByRole("link", { name: "Back to Browse" }).click();
  await page.waitForURL("/browse");
  await expect(page.getByRole("heading", { level: 1, name: "Browse" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("filling a name with no parent succeeds, showing just the new location's name", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/locations/new");

  await page.getByLabel("Name").fill("Attic");
  await page.getByRole("button", { name: "Add location" }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  // With no parent chosen, both the heading and the (single-segment)
  // breadcrumb read exactly "Attic" — checking the container's text
  // content, rather than a single unique element, is what actually
  // matches that intentional duplication instead of fighting it.
  await expect(status).toContainText("Attic");
  // No parent chosen: no ancestor breadcrumb segment/separator rendered.
  await expect(status.getByText("›")).toHaveCount(0);
});

test("submitting with an empty name shows a specific inline error and never navigates away", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/locations/new");

  await page.getByRole("button", { name: "Add location" }).click();

  await expect(page.getByText("Enter a name for this location.")).toBeVisible();
  await expect(page).toHaveURL(/\/locations\/new$/);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a parent that's typed but never resolved to an existing place is rejected with its own specific message", async ({
  page,
}) => {
  await signUpFreshAccount(page);
  await page.goto("/locations/new");

  await page.getByLabel("Name").fill("Spare batteries");
  await page.getByRole("combobox").fill("Basement");
  // Only the "+ New place called…" row exists for a query with no match —
  // this selects it, exactly like a user who typed a place that isn't in
  // the list yet and picked the only row on offer.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add location" }).click();

  await expect(
    page.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/locations\/new$/);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("the whole form, including the autocomplete, is operable keyboard-only", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet", "Toolbox"]);

  await page.goto("/locations/new");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Name").focus();
  await expect(page.getByLabel("Name")).toBeFocused();
  // A small per-key delay — real keystrokes need it for a controlled input
  // this reactive (downshift re-filters and re-renders the option list on
  // every keystroke); firing them at Playwright's default zero delay drops
  // and reorders characters.
  await page.keyboard.type("Spare fuses", { delay: 20 });

  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.type("Toolbox", { delay: 20 });
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox", exact: true })).toBeVisible();

  // Escape closes the menu without leaving the field.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByRole("combobox")).toBeFocused();

  // Reopen with the arrow key, arrow onto the match, select it.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox", exact: true })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Selected: Garage › Closet › Toolbox")).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Add location" })).toBeFocused();
  await page.keyboard.press("Enter");

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status).toContainText("Spare fuses");
  await expect(status).toContainText("Garage › Closet › Toolbox › Spare fuses");

  // "Add another" and "Back to Browse" are both still reachable without
  // leaving the keyboard.
  expect(await tabUntilFocused(page, "Add another", 5)).toBe(true);
  expect(await tabUntilHrefFocused(page, "/browse", 5)).toBe(true);
});
