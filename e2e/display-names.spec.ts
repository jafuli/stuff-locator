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

  await expect(page.getByRole("button", { name: "Household menu" })).toHaveText("N");
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
  // The household is titled after its owner when shown, so it follows too.
  await expect(sheet.getByRole("heading", { name: "Maya's household" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Household menu" })).toHaveText("M");

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

/**
 * Fails if any visible text sticks out of the viewport, measured on the
 * text itself. Checking page scroll isn't enough: rows sit in
 * overflow-hidden panels, so a long word there is clipped, not scrolled.
 */
async function expectNoTextOutsideViewport(page: Page) {
  const outside = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = node.textContent?.trim() ?? "";
      if (text === "" || node.parentElement?.closest(".sr-only") !== null) {
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0 && (rect.left < -0.5 || rect.right > width + 0.5)) {
          found.push(text.slice(0, 40));
        }
      }
    }
    return found;
  });
  expect(outside).toEqual([]);
}

/** How many lines `text`'s element wraps onto. */
async function lineCount(page: Page, text: string): Promise<number> {
  return page
    .getByText(text, { exact: true })
    .first()
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
    });
}

test("long names wrap at 375px: nothing is clipped, and a path breaks after › before it breaks inside a place", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 667 });
  const longName = "W".repeat(50);
  const longPlace = "P".repeat(60);
  const email = await signUp(page, longName);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Garage", "High shelf", "Top drawer", longPlace]);
  const client = await signedInClient(email, TEST_PASSWORD);
  const { data: item, error } = await client.rpc("stash_item", {
    p_name: "I".repeat(80),
    p_detail: "D".repeat(80),
    p_location_id: locationId,
  });
  expect(error).toBeNull();

  const sheet = await openSheet(page);
  // Nothing is stored or clamped: the title is composed when shown.
  await expect(sheet.getByRole("heading", { name: `${longName}'s household` })).toBeVisible();
  await expectNoTextOutsideViewport(page);
  await page.keyboard.press("Escape");

  await page.goto(STUFF_PATH);
  await page.waitForLoadState("networkidle");
  // Short steps move to the next line whole; only the over-long one wraps inside.
  expect(await lineCount(page, "High shelf")).toBe(1);
  expect(await lineCount(page, "Top drawer")).toBe(1);
  expect(await lineCount(page, longPlace)).toBeGreaterThan(1);
  // No "who, when" line under the row.
  await expect(page.locator("main").getByText(/ ago$/)).toHaveCount(0);
  await expectNoTextOutsideViewport(page);

  for (const path of ["/browse", "/activity", `/items/${item?.id ?? ""}`]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoTextOutsideViewport(page);
  }
});

test("the place picker's menu and chips wrap long names at 320px instead of clipping them", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const longPlace = "P".repeat(60);
  const newPlace = "Q".repeat(60);
  const email = await signUp(page, "Noa");
  await seedLocationChain(email, TEST_PASSWORD, ["Garage", "High shelf", longPlace]);

  await page.goto("/items/new");
  await page.waitForLoadState("networkidle");
  const location = page.getByRole("combobox", { name: "Location" });

  // An existing long place, found anywhere: its full path wraps after a "›";
  // only the over-long place breaks inside.
  await location.fill("PPP");
  const match = page.getByRole("option", { name: `Garage › High shelf › ${longPlace}` });
  await expect(match).toBeVisible();
  await expectNoTextOutsideViewport(page);
  expect(await lineCount(page, "High shelf")).toBe(1);

  // A long new place at the top level, then inside a long place.
  await location.fill(newPlace);
  await expect(page.getByRole("option", { name: `New place “${newPlace}”, top level` })).toBeVisible();
  await expectNoTextOutsideViewport(page);

  await location.fill("PPP");
  await match.click();
  await location.fill(newPlace);
  await expect(page.getByRole("option", { name: new RegExp(`^New “${newPlace}” inside`) })).toBeVisible();
  // The chips (one of them 60 characters) and "Goes in …" wrap too.
  await expectNoTextOutsideViewport(page);
});
