import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { seedLocationChain, signedInClient } from "./supabase-test-client";
import { STUFF_PATH } from "@/lib/routes";

// Display names (Notion: "Display names: let people set their own name"):
// sign-up asks for "Your name", the new household is named after it, and
// the household sheet edits it in place. Names are resolved when a page is
// read, so a rename shows on Stuff and on past Activity events alike.

const TEST_PASSWORD = "correct-horse-battery-1";

async function signUp(page: Page, name: string): Promise<string> {
  const email = `e2e-display-name-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(STUFF_PATH);
  return email;
}

async function openSheet(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Household menu" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  return sheet;
}

test("the sign-up name becomes your display name and names the new household", async ({ page }) => {
  await signUp(page, "Noa Levi");

  const sheet = await openSheet(page);
  await expect(sheet.getByRole("heading", { name: "Noa's household" })).toBeVisible();
  await expect(sheet.getByText("Noa Levi", { exact: true })).toBeVisible();
});

test("renaming yourself in the household sheet shows on Stuff and on past Activity", async ({ page }) => {
  const email = await signUp(page, "Noa Levi");
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Garage"]);
  const client = await signedInClient(email, TEST_PASSWORD);
  const { error } = await client.rpc("stash_item", { p_name: "Bike pump", p_location_id: locationId });
  expect(error).toBeNull();

  const sheet = await openSheet(page);
  const edit = sheet.getByRole("button", { name: "Edit your name" });
  await edit.click();

  const field = sheet.getByLabel("Your name");
  await expect(field).toBeFocused();
  await field.fill("Maya");
  await field.press("Enter");

  await expect(sheet.getByText("Maya", { exact: true })).toBeVisible();
  await expect(edit).toBeFocused();
  await page.keyboard.press("Escape");

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");
  const entry = page.getByRole("listitem").filter({ hasText: "Bike pump" });
  await expect(entry).toContainText("Maya added");
  await expect(entry).not.toContainText("Noa");
});

test("Escape cancels an edit without closing the sheet; a blank name is refused", async ({ page }) => {
  await signUp(page, "Noa");
  const sheet = await openSheet(page);

  await sheet.getByRole("button", { name: "Edit your name" }).click();
  await sheet.getByLabel("Your name").fill("Changed my mind");
  await page.keyboard.press("Escape");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Noa", { exact: true })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Edit your name" })).toBeFocused();

  await sheet.getByRole("button", { name: "Edit your name" }).click();
  await sheet.getByLabel("Your name").fill("   ");
  await sheet.getByRole("button", { name: "Save name" }).click();
  await expect(sheet.getByRole("alert")).toHaveText("Enter your name.");
});
