import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { seedItem, seedLocationChainAllIds } from "./supabase-test-client";

// Browse as navigate + tidy up (ADR 0010): "+ Add a place here", and a ⋯ menu
// on a place's own page with Rename / Move into… / Delete (blocked until the
// place is empty). Every change goes through a function that records its
// activity event, so each is also checked on /activity.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-manage-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

async function openMenuItem(page: Page, placeName: string, item: string | RegExp) {
  await page.getByRole("button", { name: `Manage ${placeName}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test("+ Add a place here adds a top-level place, then a nested one, and says so on a duplicate", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/browse");
  await page.waitForLoadState("networkidle");

  // A fresh household: the empty state invites adding one.
  await expect(page.getByText("No places yet")).toBeVisible();

  await page.getByRole("button", { name: "+ Add a place here" }).click();
  await page.getByLabel("Place name").fill("Office");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("link", { name: "Office", exact: true })).toBeVisible();
  await expect(page.getByText("No places yet")).toHaveCount(0);

  // Same name, different case: the unique-per-parent rule says no.
  await page.getByRole("button", { name: "+ Add a place here" }).click();
  await page.getByLabel("Place name").fill("office");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("You already have “office” here.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();

  // Inside the place's own page.
  await page.getByRole("link", { name: "Office", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Office" })).toBeVisible();
  await page.getByRole("button", { name: "+ Add a place here" }).click();
  await page.getByLabel("Place name").fill("Cabinet");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("link", { name: "Cabinet", exact: true })).toBeVisible();
});

test("rename: the heading becomes an input, Enter saves, Esc cancels, and Activity records it", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const [, cabinetId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Office", "Cabinet"]);

  await page.goto(`/browse/${cabinetId}`);
  await page.waitForLoadState("networkidle");

  await openMenuItem(page, "Cabinet", "Rename");
  const input = page.getByLabel("Place name");
  await expect(input).toBeFocused();
  await input.fill("Filing cabinet");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { level: 1, name: "Filing cabinet" })).toBeVisible();
  await expect(page.getByText("Office › Filing cabinet", { exact: true })).toBeVisible();

  // Esc cancels with nothing saved.
  await openMenuItem(page, "Filing cabinet", "Rename");
  await page.getByLabel("Place name").fill("Should not save");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { level: 1, name: "Filing cabinet" })).toBeVisible();

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("renamed a place")).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: /Office › Cabinet.*Office › Filing cabinet/ }),
  ).toBeVisible();
});

test("rename to a sibling's name (any case) shows the duplicate message and keeps editing", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const [officeId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Office", "Cabinet"]);

  // A second child under Office, so renaming Cabinet to it would clash.
  await page.goto(`/browse/${officeId}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "+ Add a place here" }).click();
  await page.getByLabel("Place name").fill("Shelf");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("link", { name: "Shelf", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Cabinet", exact: true }).click();
  await openMenuItem(page, "Cabinet", "Rename");
  await page.getByLabel("Place name").fill("SHELF");
  await page.keyboard.press("Enter");

  await expect(page.getByText("You already have “SHELF” here.")).toBeVisible();
  await expect(page.getByLabel("Place name")).toBeVisible();
});

test("move: a place can't be moved into itself or its descendants; moving updates the breadcrumb and Activity", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const [, cabinetId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Office", "Cabinet", "Top drawer"]);
  await seedLocationChainAllIds(email, TEST_PASSWORD, ["Bedroom"]);

  await page.goto(`/browse/${cabinetId}`);
  await page.waitForLoadState("networkidle");

  await openMenuItem(page, "Cabinet", /Move into/);
  const dialog = page.getByRole("dialog", { name: "Move “Cabinet” into…" });
  await expect(dialog).toBeVisible();

  // Neither the place itself nor anything inside it is offered, and there is
  // no "+ New" row: this is pick-only.
  await dialog.getByRole("combobox").fill("e");
  await expect(dialog.getByRole("option", { name: "Bedroom" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Office › Cabinet" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: "Office › Cabinet › Top drawer" })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /^New place/ })).toHaveCount(0);

  await dialog.getByRole("option", { name: "Bedroom" }).click();
  await dialog.getByRole("button", { name: "Move", exact: true }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Bedroom › Cabinet", { exact: true })).toBeVisible();

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("moved the place Cabinet")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: /Office.*to.*Bedroom/ })).toBeVisible();
});

test("move to the top level", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const [, cabinetId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Office", "Cabinet"]);

  await page.goto(`/browse/${cabinetId}`);
  await page.waitForLoadState("networkidle");
  await openMenuItem(page, "Cabinet", /Move into/);
  await page.getByRole("button", { name: "Top level" }).click();

  // At the top level there is no parent to go back to but Browse itself.
  await expect(page.getByRole("link", { name: "‹ Back to Browse" })).toBeVisible();
});

test("delete: an empty place is confirmed then removed and you land on its parent; Activity records it", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const [officeId, cabinetId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Office", "Cabinet"]);

  await page.goto(`/browse/${cabinetId}`);
  await page.waitForLoadState("networkidle");

  await openMenuItem(page, "Cabinet", "Delete");
  const dialog = page.getByRole("dialog", { name: "Delete “Cabinet”?" });
  await expect(dialog.getByText("It's empty. This can't be undone.")).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await page.waitForURL(`/browse/${officeId}`);
  await expect(page.getByRole("heading", { level: 1, name: "Office" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cabinet", exact: true })).toHaveCount(0);

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("deleted the place Cabinet")).toBeVisible();
  await expect(page.getByText("was in Office", { exact: true })).toBeVisible();
});

test("delete is blocked while the place holds anything: it explains what, with no destructive button", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const [, cabinetId, drawerId] = await seedLocationChainAllIds(email, TEST_PASSWORD, [
    "Office",
    "Cabinet",
    "Top drawer",
  ]);
  await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId: drawerId });

  await page.goto(`/browse/${cabinetId}`);
  await page.waitForLoadState("networkidle");

  // The menu item is there, not disabled.
  await page.getByRole("button", { name: "Manage Cabinet" }).click();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeEnabled();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  const dialog = page.getByRole("dialog", { name: "“Cabinet” isn't empty" });
  await expect(dialog.getByText("It still holds 1 item and 1 place. Move or delete them first.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toHaveCount(0);

  await dialog.getByRole("button", { name: "OK" }).click();
  await expect(dialog).toHaveCount(0);
  // Still here.
  await expect(page.getByRole("heading", { level: 1, name: "Cabinet" })).toBeVisible();
});

test("the menu and dialogs are keyboard-operable with focus trapped and returned", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const [, cabinetId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Office", "Cabinet"]);

  await page.goto(`/browse/${cabinetId}`);
  await page.waitForLoadState("networkidle");

  const trigger = page.getByRole("button", { name: "Manage Cabinet" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: /Move into/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeFocused();

  // Escape closes the menu and returns to the trigger.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Open the delete dialog by keyboard; Tab stays inside it; Escape returns to the trigger.
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press("Tab");
    await expect(dialog.locator(":focus")).toHaveCount(1);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("menu open and dialog open have no critical or serious axe violations", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const [, cabinetId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Office", "Cabinet"]);

  await page.goto(`/browse/${cabinetId}`);
  await page.waitForLoadState("networkidle");

  const serious = async () => {
    const results = await new AxeBuilder({ page }).analyze();
    return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  };

  await page.getByRole("button", { name: "Manage Cabinet" }).click();
  expect(await serious()).toEqual([]);

  await page.getByRole("menuitem", { name: /Move into/ }).click();
  await page.getByRole("dialog").getByRole("combobox").fill("off");
  await expect(page.getByRole("dialog").getByRole("option").first()).toBeVisible();
  expect(await serious()).toEqual([]);
});

test("/locations/new is gone", async ({ page }) => {
  await signUpFreshAccount(page);
  const response = await page.goto("/locations/new");
  expect(response?.status()).toBe(404);
});
