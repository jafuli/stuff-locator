import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { findItemByName, seedLocationChain } from "./supabase-test-client";
import { tabUntilFocused } from "./utils";

// Stash (/items/new) now makes a real Supabase write (see the PR
// description) — every test signs up a fresh real account first (the route
// redirects an unauthenticated visitor to /sign-in, and stash-form.tsx
// needs a real household_id/userId from the signed-in session), matching
// the account-per-test pattern already established in sign-in.spec.ts /
// sign-up.spec.ts. The happy-path and keyboard tests additionally seed a
// real "Garage > Closet > Toolbox > Red box" location chain into that
// household via the service-role client, since the autocomplete now reads
// real rows instead of the LOCATIONS fixture.
//
// None of these tests assert the captured item shows up on Home/Browse/Find
// afterward — those routes are still fixture-backed until their own
// real-data-wiring tasks land (see this task's own AC #5) — that's
// deliberately out of scope here, not an oversight.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-stash-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

test("filling a valid name, an existing location via the autocomplete, and an optional detail succeeds with a real persisted row", async ({
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
  await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet", "Toolbox", "Red box"]);

  const itemName = `Bike pump ${randomUUID()}`;

  await page.goto("/items/new");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Add an item" })).toBeVisible();

  await page.getByLabel("Name").fill(itemName);

  await page.getByRole("combobox").fill("Red box");
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox › Red box" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Location: Garage › Closet › Toolbox › Red box" })).toBeVisible();

  await page.getByLabel("Detail (optional)").fill("Top shelf, behind the shoebox");
  await page.getByRole("button", { name: "Add item" }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText(itemName, { exact: true })).toBeVisible();
  await expect(status.getByText("Garage › Closet › Toolbox › Red box")).toBeVisible();
  await expect(status.getByText("Top shelf, behind the shoebox")).toBeVisible();

  // Real persistence, not a fixture echo: query the row back directly and
  // confirm the "View item" link genuinely points at that row's own id.
  // Doesn't navigate in — item-detail's own rendering is covered directly
  // by item-detail.spec.ts (see that task's PR); this only proves Stash's
  // own link target is correct.
  const persisted = await findItemByName(itemName);
  if (!persisted) {
    throw new Error(`expected a persisted item named "${itemName}"`);
  }
  await expect(status.getByRole("link", { name: "View item" })).toHaveAttribute("href", `/items/${persisted.id}`);

  await status.getByRole("link", { name: "Back to home" }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("submitting with an empty name and no location shows specific inline errors and never navigates away", async ({
  page,
}) => {
  await signUpFreshAccount(page);
  await page.goto("/items/new");

  await page.getByRole("button", { name: "Add item" }).click();

  await expect(page.getByText("Enter a name for this item.")).toBeVisible();
  await expect(page.getByText("Choose a location for this item.")).toBeVisible();
  await expect(page).toHaveURL(/\/items\/new$/);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a place that's typed but never turned into a chip is rejected, not silently dropped", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/items/new");

  await page.getByLabel("Name").fill("Mystery gadget");
  // Typed, but neither Enter nor a row click: the text never becomes a chip.
  await page.getByRole("combobox").fill("Attic");
  await page.getByRole("button", { name: "Add item" }).click();

  await expect(page.getByText("Choose a location for this item.")).toBeVisible();
  await expect(page).toHaveURL(/\/items\/new$/);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("stashing into a brand-new 3-level path creates every level once and puts the item in the deepest", async ({
  page,
}) => {
  await signUpFreshAccount(page);
  const itemName = `Passport ${randomUUID()}`;

  await page.goto("/items/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill(itemName);

  for (const level of ["Office", "Cabinet", "Top drawer"]) {
    await page.getByRole("combobox").fill(level);
    // A brand-new level: the "+ New" row is the only option on offer.
    await expect(page.getByRole("option", { name: new RegExp(`^New place '${level}'`) })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
  }

  await expect(page.getByText("3 new places")).toBeVisible();
  await expect(page.getByRole("group", { name: "Location: Office › Cabinet › Top drawer" })).toBeVisible();

  await page.getByRole("button", { name: "Add item" }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText("Office › Cabinet › Top drawer")).toBeVisible();

  // One of each level exists, reachable through Browse.
  await page.goto("/browse");
  await expect(page.getByRole("link", { name: "Office", exact: true })).toHaveCount(1);
  await page.getByRole("link", { name: "Office", exact: true }).click();
  await expect(page.getByRole("link", { name: "Cabinet", exact: true })).toHaveCount(1);
});

test("an existing prefix plus one new level reuses the prefix and creates only the new place", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet"]);
  const itemName = `Torch ${randomUUID()}`;

  await page.goto("/items/new");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Name").fill(itemName);

  // Reach the existing Closet by its path, then add one new level inside it.
  await page.getByRole("combobox").fill("Closet");
  await page.getByRole("option", { name: "Garage › Closet" }).click();
  await page.getByRole("combobox").fill("Toolbox");
  await page.getByRole("option", { name: "New place 'Toolbox' inside Garage › Closet" }).click();

  await expect(page.getByText("1 new place")).toBeVisible();
  await page.getByRole("button", { name: "Add item" }).click();

  const status = page.getByRole("status");
  await expect(status.getByText("Garage › Closet › Toolbox")).toBeVisible();

  await page.goto("/browse");
  await expect(page.getByRole("link", { name: "Garage", exact: true })).toHaveCount(1);
});

test("typing an existing place's name, in any case, lists it 'already here' instead of offering + New", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  await seedLocationChain(email, TEST_PASSWORD, ["Office"]);

  await page.goto("/items/new");
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox").fill("OFFICE");

  await expect(page.getByRole("option", { name: "Office, already here" })).toBeVisible();
  await expect(page.getByRole("option", { name: /^New place/ })).toHaveCount(0);
});

test("a brand-new path can be built keyboard-only, including backing out of a level with Backspace", async ({
  page,
}) => {
  await signUpFreshAccount(page);
  await page.goto("/items/new");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Name").focus();
  await page.keyboard.type("Spare keys", { delay: 20 });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox")).toBeFocused();

  await page.keyboard.type("Hallway", { delay: 20 });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Shelf", { delay: 20 });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Location: Hallway › Shelf" })).toBeVisible();

  // Backspace in the empty field removes the last level.
  await page.keyboard.press("Backspace");
  await expect(page.getByRole("group", { name: "Location: Hallway" })).toBeVisible();

  await page.keyboard.type("Key hook", { delay: 20 });
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Location: Hallway › Key hook" })).toBeVisible();
});

test("the whole form, including the autocomplete, is operable keyboard-only", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  await seedLocationChain(email, TEST_PASSWORD, ["Garage", "Closet", "Toolbox", "Red box"]);

  await page.goto("/items/new");
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Name").focus();
  await expect(page.getByLabel("Name")).toBeFocused();
  // A small per-key delay — real keystrokes need it for a controlled input
  // this reactive (downshift re-filters and re-renders the option list on
  // every keystroke); firing them at Playwright's default zero delay drops
  // and reorders characters.
  await page.keyboard.type("Passport", { delay: 20 });

  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.type("Red box", { delay: 20 });
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox › Red box" })).toBeVisible();

  // Escape closes the menu without leaving the field.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect(page.getByRole("combobox")).toBeFocused();

  // Reopen with the arrow key, arrow onto the match, select it.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("option", { name: "Garage › Closet › Toolbox › Red box" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Location: Garage › Closet › Toolbox › Red box" })).toBeVisible();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Detail (optional)")).toBeFocused();
  await page.keyboard.type("Top drawer", { delay: 20 });

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Add item" })).toBeFocused();
  await page.keyboard.press("Enter");

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText("Passport")).toBeVisible();
  await expect(status.getByText("Garage › Closet › Toolbox › Red box")).toBeVisible();

  // The "View item" / "Add another" / "Back to home" row is still reachable
  // without leaving the keyboard.
  expect(await tabUntilFocused(page, "Back to home", 5)).toBe(true);
});
