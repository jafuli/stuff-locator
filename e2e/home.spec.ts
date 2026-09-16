import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { tabUntilFocused } from "./utils";

const TEST_PASSWORD = "correct-horse-battery-1";

// Only the Stash-entry-point test below needs this: /items/new now
// redirects an unauthenticated visitor to /sign-in (see stash.spec.ts's
// header comment), so following the "+ Add item" link all the way through
// needs a real signed-in session. Home itself is still fixture-only and
// unauthenticated in this task's scope — see the boot test above, which is
// intentionally left as-is.
async function signUpFreshAccount(page: Page): Promise<void> {
  const email = `e2e-home-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
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

  // Raised from tabUntilFocused's default max of 25: each item row now
  // contributes one link per breadcrumb segment in addition to its own
  // item link (AC #4 — Browse entry points from the home page), so there
  // are more real tab stops before reaching the bottom nav than there used
  // to be. Still a genuine keyboard-reachability check, just over a longer
  // — and now more richly interactive — tab order.
  expect(await tabUntilFocused(page, "Activity", 40)).toBe(true);

  expect(consoleErrors).toEqual([]);
});

test("home has a visible, keyboard-reachable entry point into the Stash flow", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const addItemLink = page.getByRole("link", { name: "+ Add item" });
  await expect(addItemLink).toBeVisible();

  // It's one of the very first tab stops on the page, right beside the h1.
  expect(await tabUntilFocused(page, "+ Add item", 5)).toBe(true);

  await addItemLink.click();
  await page.waitForURL("/items/new");
  await expect(page.getByRole("heading", { level: 1, name: "Add an item" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
