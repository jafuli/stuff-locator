import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { tabUntilFocused } from "./utils";

// Guided onboarding — shown on Home instead of the plain empty state for a
// household with zero items that hasn't finished (or skipped) the sequence
// yet. Every test signs up a fresh real account (bootstrap gives it a real,
// genuinely empty household — zero items AND zero locations, which is
// exactly the case where every level of the path is new; see guided-onboarding.tsx's
// own doc comment).
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-onboarding-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

async function stashViaOnboardingStep(page: Page, name: string, locationName: string): Promise<void> {
  await page.getByLabel("Name").fill(name);
  await page.getByRole("combobox").fill(locationName);
  // The first row: the existing place when one by that name is already here,
  // otherwise the "+ New place" row — never both. Wait for the list to
  // reflect the typed text before arrowing: the field updates first.
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add item" }).click();
  // A generous explicit timeout: this is a real network round trip — under
  // concurrent e2e load against the local Supabase stack, the default 5s
  // assertion timeout was observed to flake here.
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible({ timeout: 10_000 });
}

test("a brand-new household sees guided onboarding, with all four steps reachable", async ({ page }) => {
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

  await expect(page.getByText("Step 1 of 4")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stash something filed away" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("skip path: skipping every step completes onboarding and reaches the real empty state, which persists on reload", async ({
  page,
}) => {
  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Skip this step" }).click();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
  await page.getByRole("button", { name: "Skip this step" }).click();
  await expect(page.getByText("Step 3 of 4")).toBeVisible();
  await page.getByRole("button", { name: "Skip this step" }).click();
  await expect(page.getByText("Step 4 of 4")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Invite your partner" })).toBeVisible();

  await page.getByRole("button", { name: "Finish without inviting" }).click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("No items yet")).toBeVisible();
  await expect(page.getByText("Step 1 of 4")).toHaveCount(0);

  // Persisted, not just this render's state — a reload must not resurrect
  // onboarding now that it's genuinely done (AC #4).
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("No items yet")).toBeVisible();
  await expect(page.getByText("Step 1 of 4")).toHaveCount(0);
});

test("'Skip guided setup' exits immediately from the very first step, without clicking through the rest", async ({
  page,
}) => {
  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Skip guided setup" }).click();
  await page.waitForLoadState("networkidle");

  await expect(page.getByText("No items yet")).toBeVisible();
});

test("complete-through-invite path: real items added during onboarding show up on Home afterward, and onboarding never shows again", async ({
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

  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Step 1: a genuinely brand-new household has zero existing locations —
  // this builds a brand-new path, not just the happy path of picking
  // one that was seeded ahead of time.
  await stashViaOnboardingStep(page, "Passport", "Filing box");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();

  await stashViaOnboardingStep(page, "Camping tent", "Garage");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 3 of 4")).toBeVisible();

  await stashViaOnboardingStep(page, "Spare keys", "Kitchen drawer");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 4 of 4")).toBeVisible();

  await page.getByRole("button", { name: "Invite your partner" }).click();
  await page.waitForURL("/settings/invite");
  await expect(page.getByRole("heading", { level: 1, name: "Invite your partner" })).toBeVisible();

  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();
  await expect(page.getByText("Passport")).toBeVisible();
  await expect(page.getByText("Camping tent")).toBeVisible();
  await expect(page.getByText("Spare keys")).toBeVisible();
  await expect(page.getByText("Step 1 of 4")).toHaveCount(0);

  // Persisted independent of the item count too — matches the skip path's
  // own reload check.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Step 1 of 4")).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});

test("a household that already has items never shows onboarding, even with onboarding_completed_at still unset", async ({
  page,
}) => {
  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Adding a real item via the guided step itself is the simplest way to
  // reach "has items, never explicitly finished onboarding" without a
  // second seeding mechanism — Continue is deliberately not clicked here.
  await stashViaOnboardingStep(page, "Passport", "Filing box");

  await page.reload();
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();
  await expect(page.getByText("Passport")).toBeVisible();
  await expect(page.getByText("Step 1 of 4")).toHaveCount(0);
});

test("the guided sequence, including the location autocomplete, is operable keyboard-only", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // "Skip guided setup" is the very first tab stop — the header's
  // "+ Add item" link is hidden while onboarding runs — reachable without
  // going through the whole embedded Stash form first.
  expect(await tabUntilFocused(page, "Skip guided setup", 5)).toBe(true);

  await page.getByLabel("Name").focus();
  await expect(page.getByLabel("Name")).toBeFocused();
  await page.keyboard.type("Passport", { delay: 20 });

  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox")).toBeFocused();
  await page.keyboard.type("Filing box", { delay: 20 });
  await expect(page.getByRole("option", { name: "New place 'Filing box' at the top level" })).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  expect(await tabUntilFocused(page, "Add item", 5)).toBe(true);
  await page.keyboard.press("Enter");

  // tabUntilFocused presses Tab synchronously with no polling — waiting
  // for the real insert to resolve and the Continue button to actually
  // exist first avoids racing that async write (a real network round
  // trip).
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible({ timeout: 10_000 });

  // A generous bound, not a precise count — after submit, focus resets to
  // the top of the document (the submit button that had it is now
  // unmounted), so this passes "Skip guided setup" before reaching the
  // Continue button (the embedded success panel has no controls of its own).
  expect(await tabUntilFocused(page, "Continue", 25)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
  // Focus lands on the new step's heading instead of being lost to <body>.
  await expect(page.getByRole("heading", { name: "Stash something bulky" })).toBeFocused();
});

test("the onboarding screen has one way forward: no header '+ Add item', no View item / Add another / Back to home", async ({
  page,
}) => {
  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("link", { name: "+ Add item" })).toHaveCount(0);

  await stashViaOnboardingStep(page, "Passport", "Filing box");

  await expect(page.getByRole("status").getByText("Passport")).toBeVisible();
  await expect(page.getByRole("link", { name: "View item" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Back to home" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add another" })).toHaveCount(0);
});

test("a place created in step 1 is offered as an existing place in step 2", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await stashViaOnboardingStep(page, "Passport", "Filing box");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();

  await page.getByRole("combobox").fill("Filing box");
  await expect(page.getByRole("option", { name: "Filing box, already here" })).toBeVisible();
  await expect(page.getByRole("option", { name: /^New place/ })).toHaveCount(0);
});

test("'Skip guided setup' is a comfortable touch target (at least 44px tall)", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const box = await page.getByRole("button", { name: "Skip guided setup" }).boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("the same place typed in two steps ends up as exactly one place on Browse", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Step 1: Office does not exist yet, so "+ New place" is the only row.
  await stashViaOnboardingStep(page, "Passport", "Office");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: the same name again. The reproduced bug offered "+ New place"
  // here and created a second Office; now the existing one is listed
  // "already here" and there is no create row to take.
  await page.getByLabel("Name").fill("Camping tent");
  await page.getByRole("combobox").fill("Office");
  await expect(page.getByRole("option", { name: "Office, already here" })).toBeVisible();
  await expect(page.getByRole("option", { name: /^New place/ })).toHaveCount(0);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible({ timeout: 10_000 });

  await page.goto("/browse");
  await expect(page.getByRole("link", { name: "Office", exact: true })).toHaveCount(1);
});

test("a nested place can be built in one go during onboarding, and the placeholder hints at nesting", async ({
  page,
}) => {
  await signUpFreshAccount(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  await expect(page.getByPlaceholder("e.g. Office, then Cabinet…")).toBeVisible();

  await page.getByLabel("Name").fill("Passport");
  for (const level of ["Office", "Cabinet", "Top drawer"]) {
    await page.getByRole("combobox").fill(level);
    await expect(page.getByRole("option", { name: new RegExp(`^New place '${level}'`) })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
  }
  await expect(page.getByText("3 new places")).toBeVisible();
  await page.getByRole("button", { name: "Add item" }).click();

  await expect(page.getByRole("status").getByText("Office › Cabinet › Top drawer")).toBeVisible({ timeout: 10_000 });
});
