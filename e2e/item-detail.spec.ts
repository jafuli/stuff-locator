import { test, expect } from "@playwright/test";
import { tabUntilFocused } from "./utils";

// Item-detail is still fixture-only (a separate, future wiring task — see
// CLAUDE.md/the Home task's own AC #6) and reachable by anyone, so these
// two tests navigate to it directly by URL rather than clicking through
// from Home: Home now reads real household data and redirects an
// unauthenticated visitor to /sign-in (see home.spec.ts), so it can no
// longer be relied on to render these fixture items at all. The click-
// through/tab-through interaction itself (an item row linking to its own
// /items/[id]) is unit-tested directly against real data in
// src/__tests__/stuff-list.test.tsx; what's left to verify here is
// item-detail's own rendering, which direct navigation isolates cleanly.
test("item-detail shows the item's full detail", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  await page.goto("/items/passport");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Passport" })).toBeVisible();
  await expect(page.getByText("Bedroom › Filing box")).toBeVisible();
  await expect(page.getByText("with the birth certificates")).toBeVisible();
  await expect(page.getByRole("link", { name: "‹ Back to Stuff" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("the detail page's back link is keyboard-reachable", async ({ page }) => {
  await page.goto("/items/spare-house-keys");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Spare house keys" })).toBeVisible();
  expect(await tabUntilFocused(page, "‹ Back to Stuff")).toBe(true);
});

test("an unknown item id renders the not-found state, not a raw crash", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  await page.goto("/items/does-not-exist");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Item not found")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Stuff" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
