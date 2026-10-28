import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { openHouseholdMenu, tabUntilFocused } from "./utils";

const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<void> {
  const email = `e2e-household-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  // Hydrated before any keyboard driving: Tab presses during hydration can
  // land on a page that's about to re-render.
  await page.waitForLoadState("networkidle");
}

test("the household sheet opens from the keyboard, traps focus, closes on Escape and hands focus back", async ({
  page,
}) => {
  await signUpFreshAccount(page);
  expect(await tabUntilFocused(page, "Household menu", 45)).toBe(true);
  const button = page.getByRole("button", { name: "Household menu" });

  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  // Focus lands on the first row.
  await expect(sheet.getByRole("link", { name: "Invite partner" })).toBeFocused();

  // Two rows: Tab cycles and never leaves the sheet.
  const rows = ["Sign out", "Invite partner"];
  for (const name of rows) {
    await page.keyboard.press("Tab");
    await expect(sheet.getByRole(name === "Sign out" ? "button" : "link", { name })).toBeFocused();
  }
  await page.keyboard.press("Shift+Tab");
  await expect(sheet.getByRole("button", { name: "Sign out" })).toBeFocused();
  // No Settings row until there is a settings page.
  await expect(sheet.getByRole("link", { name: "Settings" })).toHaveCount(0);

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");
});

test("tapping the scrim closes the sheet", async ({ page }) => {
  await signUpFreshAccount(page);
  await openHouseholdMenu(page);
  await page.getByRole("button", { name: "Close dialog" }).click({ position: { x: 10, y: 10 } });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the capsule floats clear of the last row and the page doesn't scroll sideways at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await signUpFreshAccount(page);
  await page.goto("/activity");
  await page.waitForLoadState("networkidle");

  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toBeVisible();
  const box = await nav.boundingBox();
  expect(box).not.toBeNull();
  // Floating: the capsule's bottom edge sits above the viewport's bottom by
  // at least space-6 (24px).
  expect(700 - (box?.y ?? 0) - (box?.height ?? 0)).toBeGreaterThanOrEqual(24);
  // Both tabs are real touch targets.
  for (const name of ["Stuff", "Activity"]) {
    const tab = await nav.getByRole("link", { name }).boundingBox();
    expect(tab?.height ?? 0).toBeGreaterThanOrEqual(44);
    expect(tab?.width ?? 0).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the open household sheet has no critical or serious axe violations (${colorScheme})`, async ({ page }) => {
    await signUpFreshAccount(page);
    await page.waitForLoadState("networkidle");
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await openHouseholdMenu(page);
    const results = await new AxeBuilder({ page }).analyze();
    const seriousOrWorse = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toEqual([]);
  });
}
