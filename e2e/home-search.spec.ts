import { test, expect } from "@playwright/test";

test("searching the home item list filters, shows no-matches, and clears back to the full list", async ({ page }) => {
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
  await page.waitForLoadState("networkidle");

  const search = page.getByRole("searchbox", { name: "Search your stuff" });
  await expect(search).toBeVisible();

  // The search input is the first focusable element in the page (before
  // any item link), so a single Tab from a fresh load should reach it.
  // Checked before any .fill() below, since Playwright's fill() focuses
  // its target — a Tab afterwards would move focus past it, not onto it.
  // Not using tabUntilFocused here: that helper matches by aria-label or
  // textContent, and this input is labelled via an associated <label
  // htmlFor>, which contributes neither.
  await page.keyboard.press("Tab");
  const focusedId = await page.evaluate(() => document.activeElement?.id ?? null);
  expect(focusedId).toBe("stuff-search");

  // A query matching exactly one fixture item narrows the list to it.
  await search.fill("passport");
  await expect(page.getByText("Passport")).toBeVisible();
  await expect(page.getByText("Spare house keys")).toHaveCount(0);

  // A query matching nothing shows the dedicated no-matches empty state.
  await search.fill("this matches nothing at all");
  await expect(page.getByText("No matches")).toBeVisible();

  // Clearing the input restores the full original list.
  await search.fill("");
  await expect(page.getByText("Passport")).toBeVisible();
  await expect(page.getByText("Spare house keys")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
