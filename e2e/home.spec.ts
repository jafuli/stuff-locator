import { test, expect } from "@playwright/test";
import { tabUntilFocused } from "./utils";

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

  // Raised from tabUntilFocused's default max of 25: each item row now
  // contributes one link per breadcrumb segment in addition to its own
  // item link (AC #4 — Browse entry points from the home page), so there
  // are more real tab stops before reaching the bottom nav than there used
  // to be. Still a genuine keyboard-reachability check, just over a longer
  // — and now more richly interactive — tab order.
  expect(await tabUntilFocused(page, "Activity", 40)).toBe(true);

  expect(consoleErrors).toEqual([]);
});
