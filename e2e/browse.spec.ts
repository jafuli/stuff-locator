import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { seedItem, seedLocationChain, seedLocationChainAllIds } from "./supabase-test-client";
import { tabUntilFocused } from "./utils";

// Browse (/browse, /browse/[id]) now reads real household data — every test
// signs up a fresh real account first (both routes redirect an
// unauthenticated visitor to /sign-in) and seeds real locations/items via
// the service-role client, matching the account-per-test pattern already
// established in stash.spec.ts / home.spec.ts.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-browse-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

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

  const email = await signUpFreshAccount(page);
  const redBoxId = await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet", "Toolbox", "Red box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Spare house keys", locationId: redBoxId });

  await page.goto("/browse");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Browse" })).toBeVisible();

  await page.getByRole("link", { name: "Garage" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Garage" })).toBeVisible();

  // exact: true throughout this drill-down: every level here also shows
  // "Spare house keys" (nested underneath) via the subtree RPC, and its own
  // row's accessible name includes its full breadcrumb path — which
  // substring-matches "Closet"/"Toolbox"/"Red box" without exact: true,
  // same ambiguity locations-new.spec.ts already documents for this exact
  // shape of collision.
  await page.getByRole("link", { name: "Closet", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Closet" })).toBeVisible();
  await expect(page.getByText("Garage › Closet", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Toolbox", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Toolbox" })).toBeVisible();

  await page.getByRole("link", { name: "Red box", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Red box" })).toBeVisible();
  await expect(page.getByText("Spare house keys")).toBeVisible();

  // Keyboard-operable back-nav (AC #5): "‹ Back to Toolbox" is a real link,
  // reachable by Tab and activated by Enter, not just mouse-clickable.
  expect(await tabUntilFocused(page, "‹ Back to Toolbox")).toBe(true);
  await page.keyboard.press("Enter");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Toolbox" })).toBeVisible();

  // Drill back down. Its row links to the real item's own id — verified via
  // href, not by navigating in: /items/[id] is still fixture-only until its
  // own separate wiring task lands (same "out of scope here" precedent
  // stash.spec.ts already established for this exact coupling).
  await page.getByRole("link", { name: "Red box", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("link", { name: "Spare house keys" })).toHaveAttribute("href", `/items/${itemId}`);

  expect(consoleErrors).toEqual([]);
});

test("a location's page shows every item nested anywhere in its subtree, not just items stored directly in it", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const [garageId, , , redBoxId] = await seedLocationChainAllIds(email, TEST_PASSWORD, [
    "Garage",
    "Closet",
    "Toolbox",
    "Red box",
  ]);
  await seedItem(email, TEST_PASSWORD, { name: "Spare house keys", locationId: redBoxId });

  // location_subtree_items is a recursive read — visiting the ROOT (Garage)
  // directly must show an item three levels down, with no drill-down
  // needed. This is the semantic change from the old fixture behavior
  // (direct-items-only) this task's AC calls for — see the PR description.
  await page.goto(`/browse/${garageId}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Garage" })).toBeVisible();
  await expect(page.getByText("Spare house keys")).toBeVisible();
  // Its own child location ("Closet") is still listed too — subtree items
  // don't replace the direct-children drill-down list, they sit alongside
  // it. exact: true — the item row's own accessible name also
  // substring-matches "Closet" via its full breadcrumb path.
  await expect(page.getByRole("link", { name: "Closet", exact: true })).toBeVisible();
});

test("a location with nothing anywhere in its subtree shows the real empty state, not a blank list", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const [atticId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Attic"]);

  await page.goto(`/browse/${atticId}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Attic" })).toBeVisible();
  await expect(page.getByText("Nothing stored here yet")).toBeVisible();
  await expect(page.getByText("No items or sub-locations here.")).toBeVisible();
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

  await signUpFreshAccount(page);
  // Not a valid uuid at all — exercises the malformed-id branch (Postgres
  // 22P02) folded into the same not-found state as a well-formed but
  // nonexistent id, rather than crashing into error.tsx.
  await page.goto("/browse/does-not-exist");
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("Location not found")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Browse" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
