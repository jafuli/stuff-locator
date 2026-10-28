import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedItem, seedLocationChainAllIds, signedInClient } from "./supabase-test-client";

const TEST_PASSWORD = "correct-horse-battery-1";

async function signUp(page: Page): Promise<string> {
  const email = `e2e-browse-screens-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

async function expectNoSeriousViolations(page: Page, colorScheme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrWorse = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(seriousOrWorse, `${colorScheme}: ${JSON.stringify(seriousOrWorse, null, 2)}`).toEqual([]);
}

test("a place page has one display heading, an Items and a Places section, and a ⋯ menu whose Delete is signal", async ({
  page,
}) => {
  const email = await signUp(page);
  const [garageId, closetId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Garage", "Closet"]);
  await seedItem(email, TEST_PASSWORD, { name: `Ladder ${randomUUID().slice(0, 6)}`, locationId: closetId });
  await page.goto(`/browse/${garageId}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1, name: "Garage" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Places" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Items" })).toBeVisible();

  await page.getByRole("button", { name: "Manage Garage" }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const color = (name: string) => menu.getByRole("menuitem", { name }).evaluate((el) => getComputedStyle(el).color);
  // Rename and Move read as ink; only Delete is the signal accent.
  expect(await color("Delete")).not.toBe(await color("Rename"));
  expect(await color("Rename")).toBe(await color("Move into…"));
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the place menu and the delete confirmation have no critical or serious axe violations (${colorScheme})`, async ({
    page,
  }) => {
    const email = await signUp(page);
    const emptyId = (await seedLocationChainAllIds(email, TEST_PASSWORD, ["Attic"]))[0];
    await page.goto(`/browse/${emptyId}`);
    await page.waitForLoadState("networkidle");

    await page.getByRole("button", { name: "Manage Attic" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expectNoSeriousViolations(page, colorScheme);

    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(page.getByRole("dialog", { name: /Delete/ })).toBeVisible();
    await expectNoSeriousViolations(page, colorScheme);
  });
}

test("activity shows a move as two path trails, with the tape on each destination", async ({ page }) => {
  const email = await signUp(page);
  const client = await signedInClient(email, TEST_PASSWORD);
  const tag = randomUUID().slice(0, 6);
  const unwrap = <T>(result: { data: T | null; error: { message: string } | null }): T => {
    if (result.error || result.data === null) {
      throw new Error(result.error?.message ?? "no data");
    }
    return result.data;
  };
  const item = unwrap(await client.rpc("stash_item", { p_name: `Tent ${tag}`, p_new_path: ["Garage", "Shelf"] }));
  const attic = unwrap(await client.rpc("create_location", { p_name: `Attic ${tag}` }));
  unwrap(await client.rpc("move_item", { p_item_id: item.id, p_new_location_id: attic.id }));

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

  const moveRow = page.getByRole("listitem").filter({ hasText: "moved" });
  await expect(moveRow).toHaveCount(1);
  await expect(moveRow).toContainText("Garage › Shelf");
  await expect(moveRow).toContainText(`Attic ${tag}`);
  // Rows are at least 56px, and the page doesn't scroll sideways at 320px.
  expect((await moveRow.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
});
