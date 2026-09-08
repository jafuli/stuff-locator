import { test, expect, type Page } from "@playwright/test";

// Selects root layout.tsx's own scroll container by its class
// (`flex-1 overflow-y-auto`, the only element in the app with that class —
// see layout.tsx) rather than adding a data-testid, to keep this fix's diff
// scoped to the one-line sizing change it's actually about.
async function scrollSlack(page: Page): Promise<number> {
  return page.evaluate(() => {
    const container = document.querySelector(".overflow-y-auto");
    if (!container) {
      throw new Error("Expected root layout's scroll container (.overflow-y-auto) to exist");
    }
    return container.scrollHeight - container.clientHeight;
  });
}

for (const viewport of [
  { name: "a short viewport", width: 320, height: 568 },
  { name: "a tall viewport", width: 1280, height: 1024 },
]) {
  test(`/~offline introduces no extra scrollable slack under the fixed nav shell (${viewport.name})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/~offline");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { level: 1, name: "You're offline" })).toBeVisible();

    // 1px tolerance for sub-pixel rounding, matching the fix's own AC.
    expect(await scrollSlack(page)).toBeLessThanOrEqual(1);

    // No horizontal overflow either (unchanged requirement).
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
}
