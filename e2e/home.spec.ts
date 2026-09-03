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

  expect(await tabUntilFocused(page, "Activity")).toBe(true);

  expect(consoleErrors).toEqual([]);
});
