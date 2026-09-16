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

  // Drill back down. Its row links to the item's own id — verified via
  // href, not by navigating in: item-detail now reads real data (see that
  // task's PR) and this fixture id ("spare-house-keys") was never
  // something its real reads could resolve — Browse itself is still
  // fixture-only until its own separate wiring task lands.
  await page.getByRole("link", { name: "Red box" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: "Spare house keys" })).toHaveAttribute(
    "href",
    "/items/spare-house-keys",
  );

  expect(consoleErrors).toEqual([]);
});

// The former "clicking a home-page breadcrumb segment lands on the
// matching /browse/[id]" test lived here, coupling this file to Home's
// fixture-rendered breadcrumb links. Home now reads real household data
// (see home.spec.ts) — its item breadcrumbs link to real /browse/[uuid]
// paths that this still-fixture-only Browse route can never resolve
// (LOCATIONS only knows fixture ids), so asserting on Browse's *rendered
// content* after that click is no longer possible to do honestly. The part
// of that test actually about Home (a real item's breadcrumb segment
// linking to the right /browse/[id] href) now lives in home.spec.ts
// instead, without navigating into Browse itself — see this task's AC #6
// (Browse reads are explicitly out of scope) and the PR description.

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
