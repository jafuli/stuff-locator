import { test, expect, type Page } from "@playwright/test";

/**
 * Tabs forward from the top of the document until an element with the given
 * accessible name is focused, or gives up after `max` presses. Used instead
 * of `.focus()` (which sets focus programmatically regardless of tab order)
 * to prove the element is actually reachable by keyboard.
 */
async function tabUntilFocused(page: Page, name: string, max = 25): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    const focusedName = await page.evaluate((): string => {
      const el = document.activeElement;
      if (!el) {
        return "";
      }
      const ariaLabel = el.getAttribute("aria-label");
      if (ariaLabel !== null) {
        return ariaLabel;
      }
      // Element.textContent (unlike the broader Node.textContent) is never
      // null per spec — TS's DOM lib narrows it accordingly, so no null
      // check here.
      return el.textContent.trim();
    });
    if (focusedName === name) {
      return true;
    }
  }
  return false;
}

test("home route boots cleanly, shows the item list, and is keyboard-reachable", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  await page.goto("/");
  // next/link prefetches in-viewport links shortly after paint, not
  // synchronously with navigation — waiting for network idle before
  // asserting on consoleErrors below is what actually catches that class of
  // bug (e.g. a link pointing at a route that 404s on prefetch), instead of
  // racing ahead of it.
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search your stuff" })).toBeVisible();
  await expect(page.getByText("Spare house keys")).toBeVisible();
  await expect(page.getByRole("link", { name: "Stuff" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Activity" })).toBeVisible();

  expect(await tabUntilFocused(page, "Activity")).toBe(true);

  expect(consoleErrors).toEqual([]);
});
