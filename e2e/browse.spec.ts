import { test, expect } from "@playwright/test";
import { tabUntilFocused } from "./utils";

test("drilling down through nested locations from /browse reaches an item, and back-nav is keyboard-operable", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  await page.goto("/browse");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Browse" })).toBeVisible();

  await page.getByRole("link", { name: "Garage" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Garage" })).toBeVisible();

  await page.getByRole("link", { name: "Closet" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Closet" })).toBeVisible();

  await page.getByRole("link", { name: "Toolbox" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Toolbox" })).toBeVisible();

  await page.getByRole("link", { name: "Red box" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Red box" })).toBeVisible();
  await expect(page.getByText("Spare house keys")).toBeVisible();

  // Keyboard-operable back-nav (AC #5): "‹ Back to Toolbox" is a real link,
  // reachable by Tab and activated by Enter, not just mouse-clickable.
  expect(await tabUntilFocused(page, "‹ Back to Toolbox")).toBe(true);
  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Toolbox" })).toBeVisible();

  // Drill back down and open the item itself.
  await page.getByRole("link", { name: "Red box" }).click();
  await page.waitForLoadState("networkidle");
  await page.getByText("Spare house keys", { exact: true }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Spare house keys" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("clicking a home-page breadcrumb segment lands on the matching /browse/[id]", async ({ page }) => {
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

  // Passport's breadcrumb is "Bedroom › Filing box"; its leaf segment links
  // to /browse/bedroom-filing-box.
  await page.getByRole("link", { name: "Filing box" }).click();
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveURL(/\/browse\/bedroom-filing-box$/);
  await expect(page.getByRole("heading", { level: 1, name: "Filing box" })).toBeVisible();
  await expect(page.getByText("Passport")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("an unknown location id renders the not-found state, not a raw crash", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  await page.goto("/browse/does-not-exist");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Location not found")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Browse" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
