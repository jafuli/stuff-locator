import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { tabUntilFocused, tabUntilHrefFocused } from "./utils";

// Edit item (/items/[id]/edit) is fixture-only — there is no backend call
// anywhere in this flow, and neither a successful edit nor a delete is
// ever written back into the fixture item list. None of these tests assert
// the change persists across a reload or shows up on Home/Browse/Search
// afterward, by design (see the PR description) — that's deliberately out
// of scope here, not an oversight.
const TEST_PASSWORD = "correct-horse-battery-1";

// Only the delete test below needs this: it navigates back to "/" at the
// end, and Home now reads real household data and redirects an
// unauthenticated visitor to /sign-in instead (see home.spec.ts). The other
// tests in this file never leave /items/passport(/edit), so they're
// unaffected and left unauthenticated on purpose.
async function signUpFreshAccount(page: Page): Promise<void> {
  const email = `e2e-item-edit-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
}

test("has a visible, keyboard-reachable entry point from item detail", async ({ page }) => {
  await page.goto("/items/passport");
  const editLink = page.getByRole("link", { name: "Edit" });
  await expect(editLink).toBeVisible();
  expect(await tabUntilHrefFocused(page, "/items/passport/edit", 10)).toBe(true);

  await editLink.click();
  await page.waitForURL("/items/passport/edit");
  await expect(page.getByRole("heading", { level: 1, name: "Edit item" })).toBeVisible();
});

test("the form is pre-filled with the item's current values", async ({ page }) => {
  await page.goto("/items/passport/edit");

  await expect(page.getByLabel("Name")).toHaveValue("Passport");
  await expect(page.getByLabel("Detail (optional)")).toHaveValue("with the birth certificates");
  await expect(page.getByText("Selected: Bedroom › Filing box")).toBeVisible();
});

test("changing name, location, and detail succeeds, showing the new values and full breadcrumb path", async ({
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

  await page.goto("/items/passport/edit");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Name").fill("Passport (renewed)");

  await page.getByRole("combobox").fill("Red box");
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox › Red box" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Selected: Garage › Closet › Toolbox › Red box")).toBeVisible();

  await page.getByLabel("Detail (optional)").fill("with the new passport photos");
  await page.getByRole("button", { name: "Save changes" }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText("Passport (renewed)", { exact: true })).toBeVisible();
  await expect(status.getByText("Garage › Closet › Toolbox › Red box")).toBeVisible();
  await expect(status.getByText("with the new passport photos")).toBeVisible();

  await status.getByRole("link", { name: "Back to item" }).click();
  await page.waitForURL("/items/passport");

  expect(consoleErrors).toEqual([]);
});

test("submitting with an empty name shows a specific inline error and never navigates away", async ({ page }) => {
  await page.goto("/items/passport/edit");

  await page.getByLabel("Name").fill("");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Enter a name for this item.")).toBeVisible();
  await expect(page).toHaveURL(/\/items\/passport\/edit$/);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("no location resolved (typed but never selected) is rejected with its own specific message", async ({
  page,
}) => {
  await page.goto("/items/passport/edit");

  await page.getByRole("combobox").fill("Attic");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(
    page.getByText("Pick an existing location from the list — adding a new one isn't supported here yet."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/items\/passport\/edit$/);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("delete requires confirmation: cancel leaves the item unchanged, confirm succeeds with a path to Home", async ({
  page,
}) => {
  await signUpFreshAccount(page);
  await page.goto("/items/passport/edit");

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
});

test("the whole edit form, including delete confirmation, is operable keyboard-only", async ({ page }) => {
  await page.goto("/items/passport/edit");

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
