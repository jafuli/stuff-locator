import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { seedItem, seedLocationChain } from "./supabase-test-client";
import { tabUntilFocused, tabUntilHrefFocused } from "./utils";
import { STUFF_PATH } from "@/lib/routes";

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
  await page.waitForURL(STUFF_PATH);
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
  await expect(page.getByRole("group", { name: "Location: Bedroom › Filing box" })).toBeVisible();
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

  // Lands on the item's own page — the notice parameter is dropped from the
  // address bar once shown.
  await page.waitForURL(`/items/${itemId}`);
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(page.getByRole("heading", { level: 1, name: "Passport (renewed)" })).toBeVisible();
  await expect(page.getByText("Bedroom › Filing box")).toBeVisible();
  await expect(page.getByText("with the new passport photos")).toBeVisible();

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
  await expect(page.getByRole("group", { name: "Location: Garage › Closet › Toolbox › Red box" })).toBeVisible();

  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`/items/${itemId}`);
  await expect(page.getByText("Garage › Closet › Toolbox › Red box")).toBeVisible();

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

test("no location resolved (typed but never turned into a chip) is rejected with its own specific message", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}/edit`);

  await page.getByRole("combobox").fill("Attic");
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page.getByText("Choose a location for this item.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/items/${itemId}/edit$`));
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("moving into a place that doesn't exist yet: tap a chip to go back a level, type the new name, save", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet", "Toolbox", "Red box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Spare house keys", locationId });

  await page.goto(`/items/${itemId}/edit`);
  await page.waitForLoadState("networkidle");

  // Back up from "Red box" to "Toolbox", then add a brand-new "Blue tin".
  await page.getByRole("button", { name: "Toolbox. Go back to this level" }).click();
  await expect(page.getByRole("group", { name: "Location: Garage › Closet › Toolbox" })).toBeVisible();
  await page.getByRole("combobox").fill("Blue tin");
  await page.getByRole("option", { name: "New place 'Blue tin' inside Garage › Closet › Toolbox" }).click();
  await expect(page.getByText("1 new place")).toBeVisible();

  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`/items/${itemId}`);
  await expect(page.getByText("Garage › Closet › Toolbox › Blue tin")).toBeVisible();

  await page.goto(`/items/${itemId}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Garage › Closet › Toolbox › Blue tin")).toBeVisible();
});

test("delete, from the item page: a trash icon opens a confirm dialog; Cancel or a click outside keeps the item, Delete lands on its place", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  // Delete is no longer part of the edit form.
  await page.goto(`/items/${itemId}/edit`);
  await expect(page.getByRole("button", { name: /Delete/ })).toHaveCount(0);

  await page.goto(`/items/${itemId}`);
  await page.waitForLoadState("networkidle");

  const trigger = page.getByRole("button", { name: "Delete Passport" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Delete “Passport”?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("heading", { level: 1, name: "Passport" })).toBeVisible();

  // A click outside the card closes it too, like the delete-place dialog.
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click({ position: { x: 10, y: 10 } });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  // The Browse page of the place it was in, never a page for the deleted item.
  await page.waitForURL(`/browse/${locationId}`);
  await expect(page.getByRole("status")).toHaveText("Deleted Passport");
  await expect(page.getByRole("heading", { level: 1, name: "Filing box" })).toBeVisible();

  // A reload is the same place page, without repeating the notice.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Filing box" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("");

  // Real deletion, not a UI-only echo — revisiting the item's own url now
  // 404s instead of resolving.
  await page.goto(`/items/${itemId}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Item not found")).toBeVisible();
});

test("on the item page, Edit and Delete sit on the name's line", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}`);
  const heading = await page.getByRole("heading", { level: 1, name: "Passport" }).boundingBox();
  const edit = await page.getByRole("link", { name: "Edit" }).boundingBox();
  const trash = await page.getByRole("button", { name: "Delete Passport" }).boundingBox();
  if (!heading || !edit || !trash) {
    throw new Error("heading, Edit or Delete not rendered");
  }
  // Both controls start at the top of the heading's line, to its right.
  expect(Math.abs(edit.y - heading.y)).toBeLessThan(8);
  expect(Math.abs(trash.y - heading.y)).toBeLessThan(8);
  expect(edit.x).toBeGreaterThan(heading.x);
  expect(trash.x).toBeGreaterThan(edit.x);
});

test("delete from the item page is operable keyboard-only", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}`);
  await page.waitForLoadState("networkidle");

  expect(await tabUntilFocused(page, "Delete Passport", 10)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Delete", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");

  await page.waitForURL(`/browse/${locationId}`);
  await expect(page.getByRole("status")).toHaveText("Deleted Passport");
});

test("the whole edit form is operable keyboard-only", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet", "Toolbox", "Red box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}/edit`);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Name").focus();
  await expect(page.getByLabel("Name")).toBeFocused();
  // The item's current place is a path of chips, each a real tab stop
  // (tapping one goes back to that level), then the field itself.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Bedroom. Go back to this level" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Filing box. Go back to this level" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox")).toBeFocused();
  // A small per-key delay — real keystrokes need it for a controlled input
  // this reactive (downshift re-filters and re-renders on every keystroke).
  await page.keyboard.type("Red box", { delay: 20 });
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox › Red box" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Location: Garage › Closet › Toolbox › Red box" })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Detail (optional)")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeFocused();
  await page.keyboard.press("Enter");

  await page.waitForURL(`/items/${itemId}`);
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(page.getByText("Garage › Closet › Toolbox › Red box")).toBeVisible();
});

test("after a save, reload and browser Back never show the edit form with the old values", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  // Arrive the way a person does: item page → Edit.
  await page.goto(`/items/${itemId}`);
  await page.getByRole("link", { name: "Edit" }).click();
  await page.waitForURL(`/items/${itemId}/edit`);
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Name").fill("Passport (renewed)");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.waitForURL(`/items/${itemId}`);
  await expect(page.getByRole("status")).toHaveText("Saved");

  // Reload: the item page again, not the edit form, and no repeated notice.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Passport (renewed)" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("");

  // Back skips the replaced edit entry: it goes to the item page the edit
  // was opened from, never to a form pre-filled with "Passport".
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/items/${itemId}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Passport (renewed)" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveCount(0);
});
