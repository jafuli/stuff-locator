import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { seedItem, seedLocationChain } from "./supabase-test-client";

const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpAndSeed(page: Page): Promise<{ keyName: string }> {
  const email = `e2e-stuff-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  const deep = await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet", "Toolbox", "Red box"]);
  const shallow = await seedLocationChain(email, TEST_PASSWORD, ["Kitchen"]);
  const keyName = `Spare key ${randomUUID().slice(0, 6)}`;
  await seedItem(email, TEST_PASSWORD, { name: keyName, locationId: deep });
  await seedItem(email, TEST_PASSWORD, { name: `Spare tin ${randomUUID().slice(0, 6)}`, locationId: shallow });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  return { keyName };
}

test("the Stuff screen has one display heading phrased as a question, a search field, and an ink Stash button", async ({
  page,
}) => {
  await signUpAndSeed(page);
  await expect(page.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("searchbox")).toBeVisible();
  const stash = page.getByRole("link", { name: "Stash", exact: true });
  await expect(stash).toBeVisible();
  const box = await stash.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(50);
});

test("searching heads the results with BEST MATCHES and marks only the first row CLOSEST — and never shows a score", async ({
  page,
}) => {
  await signUpAndSeed(page);
  await expect(page.getByText("Best matches")).toHaveCount(0);

  await page.getByRole("searchbox").fill("spare");
  await expect(page.getByRole("heading", { level: 2, name: "Best matches" })).toBeVisible();
  await expect(page.getByText("Closest", { exact: true })).toHaveCount(1);
  expect(await page.locator("main").innerText()).not.toMatch(/\d\s?%|score|similarity/i);

  // The marker is on the first result, not an arbitrary one.
  const firstRow = page.locator("main a[href^='/items/']:not([href='/items/new'])").first();
  await expect(firstRow).toContainText("Closest");

  // Clearing the search takes the search furniture away again.
  await page.getByRole("searchbox").fill("");
  await expect(page.getByText("Best matches")).toHaveCount(0);
  await expect(page.getByText("Closest", { exact: true })).toHaveCount(0);
});

test("only the last segment of a path is on tape", async ({ page }) => {
  await signUpAndSeed(page);
  const trail = page.locator("main p", { hasText: "Garage" }).first();
  const backgrounds = await trail
    .locator("a")
    .evaluateAll((links) =>
      links.map((link) => ({ text: link.textContent, bg: getComputedStyle(link).backgroundColor })),
    );
  expect(backgrounds.map((b) => b.text)).toEqual(["Garage", "Closet", "Toolbox", "Red box"]);
  const transparent = "rgba(0, 0, 0, 0)";
  expect(backgrounds.slice(0, -1).every((b) => b.bg === transparent)).toBe(true);
  expect(backgrounds.at(-1)?.bg).not.toBe(transparent);
});

test("at 320px a long path collapses its middle to a … button that names the full path and expands it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await signUpAndSeed(page);

  const more = page.getByRole("button", { name: "Show the full path: Garage, Closet, Toolbox, Red box" });
  await expect(more).toBeVisible();
  await expect(page.getByRole("link", { name: "Closet", exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );

  await more.click();
  await expect(page.getByRole("link", { name: "Closet", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Toolbox", exact: true })).toBeVisible();
});

test("from 375px up nothing is collapsed", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await signUpAndSeed(page);
  await expect(page.getByRole("link", { name: "Closet", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Show the full path/ })).toHaveCount(0);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the Stuff screen while searching has no critical or serious axe violations (${colorScheme})`, async ({
    page,
  }) => {
    await signUpAndSeed(page);
    await page.getByRole("searchbox").fill("spare");
    await expect(page.getByRole("heading", { level: 2, name: "Best matches" })).toBeVisible();
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    const results = await new AxeBuilder({ page }).analyze();
    const seriousOrWorse = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toEqual([]);
  });
}
