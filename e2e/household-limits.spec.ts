import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { expectNoSeriousAxeViolations } from "./axe";
import { seedItems, seedLocationChainAllIds, seedTopLevelPlaces, signedInClient } from "./supabase-test-client";
import { STUFF_PATH } from "@/lib/routes";

// The UI at the household limits (ADR 0015): the count lines, Stash at the
// item cap, the place-limit and depth-limit notes, Move into…'s greyed
// destinations, and Activity's collapsed long paths. Each test seeds a
// household straight to the edge through the service role.

const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-limits-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(STUFF_PATH);
  return email;
}

test("at 100 things: the count line says so, and Stash explains instead of showing the form", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const [shelfId = ""] = await seedTopLevelPlaces(email, TEST_PASSWORD, 1);
  await seedItems(email, TEST_PASSWORD, shelfId, 100);

  await page.goto(STUFF_PATH);
  await expect(page.getByText("Limit reached: 100 of 100 things")).toBeVisible();
  await expect(page.getByRole("link", { name: "All", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Stash" }).click();
  await page.waitForURL("/items/new");
  await expect(page.getByText(/^Limit reached: your household holds 100 things\./)).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveCount(0);
  await expectNoSeriousAxeViolations(page);

  await page.getByRole("link", { name: "Go to my stuff" }).click();
  await page.waitForURL(STUFF_PATH);
});

test("near the item cap the count line warns; Stash still works", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const [shelfId = ""] = await seedTopLevelPlaces(email, TEST_PASSWORD, 1);
  await seedItems(email, TEST_PASSWORD, shelfId, 92);

  await page.goto(STUFF_PATH);
  await expect(page.getByText("92 of 100 things")).toBeVisible();

  await page.goto("/items/new");
  await expect(page.getByLabel("Name")).toBeVisible();
});

test("at 100 places: Browse says so, '+ Add a place here' becomes a note, and the picker can't add one", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  await seedTopLevelPlaces(email, TEST_PASSWORD, 100);

  await page.goto("/browse");
  await expect(page.getByText("Limit reached: 100 of 100 places")).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Add a place here" })).toHaveCount(0);
  await expect(page.getByText(/^Limit reached: this household has 100 places\. Remove/)).toBeVisible();

  await page.goto("/items/new");
  await page.getByRole("combobox").fill("Shed");
  await expect(page.getByRole("option", { name: /New place/ })).toHaveCount(0);
  await expect(page.getByText("Limit reached: this household has 100 places. Pick an existing one.")).toBeVisible();

  // Existing places stay pickable: listed, not disabled, and picking one
  // really makes a chip (a disabled row would still be visible).
  await page.getByRole("combobox").fill("Place 7");
  const existing = page.getByRole("option", { name: "Place 7, already here" });
  await expect(existing).toBeVisible();
  await expect(existing).not.toHaveAttribute("aria-disabled", "true");
  await existing.click();
  await expect(page.getByRole("group", { name: "Location: Place 7" })).toBeVisible();
});

test("8 places deep: no '+ Add a place here' inside, no '+ New' in the picker, and Move into… greys what won't fit", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const chain = await seedLocationChainAllIds(
    email,
    TEST_PASSWORD,
    Array.from({ length: 8 }, (_, index) => `Level ${String(index + 1)}`),
  );
  const [boxId = ""] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Box", "Pouch"]);

  await page.goto(`/browse/${chain[7] ?? ""}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "+ Add a place here" })).toHaveCount(0);
  await expect(page.getByText(/^Limit reached: this place can't hold more places\./)).toBeVisible();

  await page.goto("/items/new");
  await page.getByRole("combobox").fill("Level 8");
  await page.keyboard.press("Enter");
  await page.getByRole("combobox").fill("Bag");
  await expect(page.getByRole("option", { name: /^New/ })).toHaveCount(0);
  await expect(page.getByText("Limit reached. Put it here, or pick a place higher up.")).toBeVisible();

  // Box › Pouch spans 2 levels: Level 6 (6 + 2 = 8) fits, Level 7 (7 + 2 = 9) doesn't.
  await page.goto(`/browse/${boxId}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Manage Box" }).click();
  await page.getByRole("menuitem", { name: /Move into/ }).click();
  const dialog = page.getByRole("dialog", { name: "Move “Box” into…" });
  await dialog.getByRole("combobox").fill("Level");

  const tooDeep = dialog.getByRole("option", { name: /Level 7, limit reached$/ });
  await expect(tooDeep).toHaveAttribute("aria-disabled", "true");
  await expect(tooDeep).toContainText("Limit reached");
  const fits = dialog.getByRole("option", { name: /Level 6$/ });
  await expect(fits).not.toHaveAttribute("aria-disabled", "true");
  await expectNoSeriousAxeViolations(page);
});

test("Activity shows a path of 4+ places as first › … › last, and '…' expands it in place", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const client = await signedInClient(email, TEST_PASSWORD);
  const { error } = await client.rpc("stash_item", {
    p_name: "Spare key",
    p_new_path: ["Garage", "Closet", "Toolbox", "Red box"],
  });
  expect(error).toBeNull();

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");
  const entry = page.getByRole("listitem").filter({ hasText: "Spare key" });
  await expect(entry).toContainText("Garage › … › Red box");
  await expect(entry).not.toContainText("Toolbox");

  await entry.getByRole("button", { name: /Show the full path/ }).click();
  await expect(entry).toContainText("Garage › Closet › Toolbox › Red box");
});
