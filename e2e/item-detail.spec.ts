import { test, expect } from "@playwright/test";
import { tabUntilFocused, tabUntilHrefFocused } from "./utils";

test("navigating from an item row to its detail page shows the item's full detail", async ({ page }) => {
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
  // Click the item's name text — it's a descendant of ItemCard's anchor, so
  // the click bubbles to (and navigates via) the enclosing <a>, same as a
  // real user tapping anywhere on the row.
  await page.getByText("Passport", { exact: true }).click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Passport" })).toBeVisible();
  await expect(page.getByText("Bedroom › Filing box")).toBeVisible();
  await expect(page.getByText("with the birth certificates")).toBeVisible();
  await expect(page.getByRole("link", { name: "‹ Back to Stuff" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("the item link and the detail page's back link are keyboard-reachable", async ({ page }) => {
  await page.goto("/");
  // ItemCard's accessible name concatenates name + breadcrumb + detail +
  // relative-time badge, so match by href rather than by name text.
  expect(await tabUntilHrefFocused(page, "/items/spare-house-keys")).toBe(true);
  await page.keyboard.press("Enter");
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
