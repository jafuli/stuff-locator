import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const TEST_PASSWORD = "correct-horse-battery-1";

async function signUp(page: Page): Promise<void> {
  const email = `e2e-forms-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  await page.waitForLoadState("networkidle");
}

async function expectNoSeriousViolations(page: Page): Promise<void> {
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }),
    );
    const results = await new AxeBuilder({ page }).analyze();
    const seriousOrWorse = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
    expect(seriousOrWorse, `${colorScheme}: ${JSON.stringify(seriousOrWorse, null, 2)}`).toEqual([]);
  }
}

test("a form's validation errors are signal-coloured text on no fill, and pass axe in both themes", async ({
  page,
}) => {
  await signUp(page);
  await page.goto("/items/new");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add item" }).click();

  // (main only: Next's route announcer is also role=alert, and not ours.)
  const alerts = page.locator("main").getByRole("alert");
  await expect(alerts.first()).toBeVisible();
  for (const alert of await alerts.all()) {
    const style = await alert.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.color, background: cs.backgroundColor };
    });
    // Errors use signal text, never a fill.
    expect(style.background).toBe("rgba(0, 0, 0, 0)");
    const ink = await page.locator("h1").evaluate((el) => getComputedStyle(el).color);
    expect(style.color).not.toBe(ink);
  }
  await expectNoSeriousViolations(page);
});

test("the Stash success panel passes axe in both themes and shows the path on tape", async ({ page }) => {
  await signUp(page);
  await page.goto("/items/new");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Name").fill("Camping stove");
  await page.getByRole("combobox").fill("Shed");
  await page.getByRole("option", { name: /New place 'Shed'/ }).click();
  await page.getByRole("button", { name: "Add item" }).click();

  const status = page.getByRole("status");
  await expect(status).toContainText("Camping stove");
  // The path is a single segment, so it is the one on tape.
  const tape = status.locator("span.bg-tape", { hasText: "Shed" });
  await expect(tape).toBeVisible();
  expect(await tape.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  await expectNoSeriousViolations(page);
});

test("signed-out auth forms are comfortable at 320px: 16px inputs, 50px controls, no sideways scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const path of ["/sign-in", "/sign-up", "/forgot-password"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const email = page.getByLabel("Email");
    const metrics = await email.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fontSize: cs.fontSize, height: el.getBoundingClientRect().height };
    });
    expect(metrics.fontSize).toBe("16px");
    expect(metrics.height).toBeGreaterThanOrEqual(50);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
      0,
    );
  }
});
