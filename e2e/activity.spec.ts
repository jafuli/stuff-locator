import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { seedLocationChainAllIds, signedInClient } from "./supabase-test-client";
import { tabUntilFocused } from "./utils";

const TEST_PASSWORD = "correct-horse-battery-1";

// /activity reads the household's activity_events log (ADR 0011). Rows get
// there only through the write functions, so these specs drive the same
// functions the app calls (stash_item, update_item, …) rather than seeding
// items with the service role, which would bypass the log. The actor shown is
// the profile display name, which for an email sign-up is the local part of
// the address.
async function signUpFreshAccount(page: Page): Promise<{ email: string; displayName: string }> {
  const displayName = `e2e-activity-${randomUUID()}`;
  const email = `${displayName}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return { email, displayName };
}

async function must<T>(result: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await result;
  if (error) {
    throw new Error(error.message);
  }
  if (data === null) {
    throw new Error("expected data");
  }
  return data;
}

test("a household with nothing stashed shows the empty state, not fixture entries", async ({ page }) => {
  await signUpFreshAccount(page);

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "What did you miss?" })).toBeVisible();
  await expect(page.getByText("Nothing has happened yet")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(0);
});

test("a stashed item appears as '<name> added <item>' with where it went, and links to the item", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  const { email, displayName } = await signUpFreshAccount(page);
  const client = await signedInClient(email, TEST_PASSWORD);
  const itemName = `Spare house keys ${randomUUID()}`;
  const item = await must(client.rpc("stash_item", { p_name: itemName, p_new_path: ["Garage", "Closet"] }));

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "What did you miss?" })).toBeVisible();
  await expect(page.getByText("Nothing has happened yet")).toHaveCount(0);

  const entry = page.getByRole("listitem").first();
  // The person's display name, never a raw user id.
  await expect(entry.getByText(displayName, { exact: true })).toBeVisible();
  await expect(entry).toContainText("added");
  await expect(entry.getByRole("link", { name: itemName })).toHaveAttribute("href", `/items/${item.id}`);
  // The path the place was created on the way in.
  await expect(entry).toContainText("in Garage › Closet");

  expect(consoleErrors).toEqual([]);
});

test("every kind of change shows up, newest first, and an item moved twice shows both moves", async ({ page }) => {
  const { email } = await signUpFreshAccount(page);
  const [garageId, closetId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Garage", "Closet"]);
  const [atticId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Attic"]);

  const client = await signedInClient(email, TEST_PASSWORD);
  const tag = randomUUID().slice(0, 8);
  const tent = `Tent ${tag}`;
  const tentRenamed = `Tent (4 person) ${tag}`;
  const charger = `Old charger ${tag}`;

  // Items: added, moved twice, renamed + detail edited, and a second item deleted.
  const item = await must(client.rpc("stash_item", { p_name: tent, p_location_id: closetId }));
  await must(client.rpc("move_item", { p_item_id: item.id, p_new_location_id: atticId }));
  await must(client.rpc("move_item", { p_item_id: item.id, p_new_location_id: garageId }));
  await must(client.rpc("update_item", { p_item_id: item.id, p_name: tentRenamed, p_detail: "poles in the blue bag" }));
  const doomed = await must(client.rpc("stash_item", { p_name: charger, p_location_id: closetId }));
  await must(client.rpc("delete_item", { p_item_id: doomed.id }));

  // Places: rename, move, delete.
  const box = await must(client.rpc("create_location", { p_name: `Box ${tag}`, p_parent_id: garageId }));
  const shelf = await must(client.rpc("create_location", { p_name: `Shelf ${tag}`, p_parent_id: garageId }));
  await must(client.rpc("rename_location", { p_location_id: box.id, p_name: `Camping box ${tag}` }));
  await must(client.rpc("move_container", { p_location_id: box.id, p_new_parent_id: atticId }));
  await must(client.rpc("delete_container", { p_location_id: shelf.id }));

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");

  const text = (await page.getByRole("listitem").allTextContents()).map((entry) => entry.replace(/\s+/g, " "));

  // Newest first: each marker appears above (earlier in the list than) the next.
  const order = [
    `deleted the place Shelf ${tag}`, // place_deleted
    `moved the place Camping box ${tag}`, // place_moved
    "renamed a place", // place_renamed
    `deleted ${charger}`, // item_deleted
    "edited the detail of", // item_detail_changed
    `renamed ${tent} → ${tentRenamed}`, // item_renamed
    "moved", // item_moved (second)
    "moved", // item_moved (first)
    `added ${tent}`, // item_added
  ];
  let cursor = -1;
  for (const marker of order) {
    const index = text.findIndex((entry, i) => i > cursor && entry.includes(marker));
    expect(index, `"${marker}" should appear after position ${String(cursor)}`).toBeGreaterThan(cursor);
    cursor = index;
  }

  // Both moves of the tent are there, each with its own from → to.
  // (A move is two PathTrails with the direction spoken for screen readers,
  // so the row's text reads "<from>to<to>".)
  const rows = page.getByRole("listitem");
  await expect(rows.filter({ hasText: /Garage › Closet.*to.*Attic/ }).first()).toBeVisible();
  await expect(rows.filter({ hasText: /Attic.*to.*Garage/ }).first()).toBeVisible();
  await expect(rows.filter({ hasText: /was in.*Garage › Closet/ }).first()).toBeVisible();
  await expect(page.getByText("“poles in the blue bag”")).toBeVisible();
  // A place deleted from under Garage says where it was; created places log nothing.
  await expect(rows.filter({ hasText: /deleted the place.*was in.*Garage/ }).first()).toBeVisible();
  await expect(rows.filter({ hasText: new RegExp(`Garage › Box ${tag}.*Garage › Camping box ${tag}`) })).toHaveCount(1);
  await expect(page.getByText(`added Box ${tag}`)).toHaveCount(0);
});

test("an activity feed entry's item link is keyboard-reachable", async ({ page }) => {
  const { email } = await signUpFreshAccount(page);
  const client = await signedInClient(email, TEST_PASSWORD);
  const itemName = `Tent ${randomUUID()}`;
  await must(client.rpc("stash_item", { p_name: itemName, p_new_path: ["Garage"] }));

  await page.goto("/activity");
  // tabUntilFocused presses Tab with no polling, so make sure the real feed
  // has rendered (and the page has settled) before the first press —
  // otherwise a slow CI run can burn Tab presses on an unsettled page.
  await expect(page.getByRole("link", { name: itemName })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(await tabUntilFocused(page, itemName, 20)).toBe(true);
});
