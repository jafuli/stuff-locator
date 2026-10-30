import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "./fixtures";
import { seedItem, seedLocationChain } from "./supabase-test-client";
import { tabUntilFocused } from "./utils";

// The All (n) / By place chips are the way into Browse (wireframes 02 / C1).
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-chips-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

async function seedTwoItems(page: Page): Promise<{ tent: string; passport: string }> {
  const email = await signUpFreshAccount(page);
  const garage = await seedLocationChain(email, TEST_PASSWORD, ["Garage"]);
  const bedroom = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const tag = randomUUID().slice(0, 8);
  const tent = `Camping tent ${tag}`;
  const passport = `Passport ${tag}`;
  await seedItem(email, TEST_PASSWORD, { name: tent, locationId: garage });
  await seedItem(email, TEST_PASSWORD, { name: passport, locationId: bedroom });
  return { tent, passport };
}

test("the Stuff screen shows All (n) with the household total, current, and By place", async ({ page }) => {
  await seedTwoItems(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const all = page.getByRole("link", { name: "All (2)" });
  await expect(all).toBeVisible();
  await expect(all).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "By place" })).not.toHaveAttribute("aria-current", /.*/);
  // The v1 "Recent" chip is deliberately not here.
  await expect(page.getByRole("link", { name: "Recent" })).toHaveCount(0);
});

test("the count is the household total, not the search results", async ({ page }) => {
  const { tent } = await seedTwoItems(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByRole("searchbox", { name: "Search your stuff" }).fill(tent);
  await expect(page.getByText(tent)).toBeVisible();
  await expect(page.getByRole("link", { name: "All (2)" })).toBeVisible();
});

test("Stuff → By place → Browse → All → Stuff, by keyboard", async ({ page }) => {
  await seedTwoItems(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  expect(await tabUntilFocused(page, "By place", 15)).toBe(true);
  await page.keyboard.press("Enter");

  await page.waitForURL("/browse");
  await expect(page.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeVisible();
  // Same header as Home, with By place now the current one.
  await expect(page.getByRole("link", { name: "By place" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("link", { name: "All (2)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Garage", exact: true })).toBeVisible();

  expect(await tabUntilFocused(page, "All (2)", 15)).toBe(true);
  await page.keyboard.press("Enter");

  await page.waitForURL("/");
  await expect(page.getByRole("link", { name: "All (2)" })).toHaveAttribute("aria-current", "page");
});

test("typing in the search box on Browse lands on Stuff with that query applied", async ({ page }) => {
  const { tent, passport } = await seedTwoItems(page);
  await page.goto("/browse");
  await page.waitForLoadState("networkidle");

  await page.getByRole("searchbox", { name: "Search your stuff" }).fill("Camping");

  await page.waitForURL(/\/\?q=Camping/);
  await expect(page.getByRole("searchbox", { name: "Search your stuff" })).toHaveValue("Camping");
  await expect(page.getByText(tent)).toBeVisible();
  await expect(page.getByText(passport)).toHaveCount(0);
  // And the person can carry on typing where they left off.
  await expect(page.getByRole("searchbox", { name: "Search your stuff" })).toBeFocused();
});

test("sub-pages keep their Back link and do not show the chips", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const garage = await seedLocationChain(email, TEST_PASSWORD, ["Garage"]);
  await page.goto(`/browse/${garage}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("link", { name: "‹ Back to Browse" })).toBeVisible();
  await expect(page.getByRole("link", { name: "By place" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Stuff view" })).toHaveCount(0);
});

test("chips are comfortable touch targets and the page doesn't scroll sideways at 320px", async ({ page }) => {
  await seedTwoItems(page);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  for (const name of ["All (2)", "By place"]) {
    const box = await page.getByRole("link", { name }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("Home and the top of Browse have no critical or serious axe violations with the chips", async ({ page }) => {
  await seedTwoItems(page);

  for (const path of ["/", "/browse"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(serious, `${path}: ${JSON.stringify(serious, null, 2)}`).toEqual([]);
  }
});
