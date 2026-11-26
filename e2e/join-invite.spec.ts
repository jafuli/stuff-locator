import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import {
  addSeededPartner,
  countHouseholdsForUser,
  householdIdsForUser,
  seedInviteForNewHousehold,
} from "./supabase-test-client";
import { signOutViaMenu } from "./utils";
import { STUFF_PATH } from "@/lib/routes";

// Redeem-invite landing (/join/[code]) — the other half of Invite-partner
// UI's `${origin}/join/${code}` link. Every test seeds a real inviter
// household + invite code via the service-role client
// (seedInviteForNewHousehold), then drives the actual landing flow through
// the browser. Real invite GENERATION through the UI is already covered
// end-to-end by invite-partner.spec.ts — this file is about redemption.
//
// The critical thing every "join" test proves, not just asserts: the
// joiner ends up in EXACTLY the inviter's household, not a
// bootstrap-created one in addition to it (this task's AC #2) — checked
// via countHouseholdsForUser, the same helper already built "to prove
// household-bootstrap doesn't create duplicate households."
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-join-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(STUFF_PATH);
  return email;
}

test("signed-out arrival: sign up through the invite link, auto-redeem, and end up in exactly the inviter's household", async ({
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

  // Unnamed, as every real household starts: titled after its owner.
  const { code } = await seedInviteForNewHousehold(null, "Maayan Cohen");
  const email = `e2e-join-${randomUUID()}@example.com`;

  await page.goto(`/join/${code}`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Join a household" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();

  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status).toContainText("You've joined Maayan's household");
  await expect(status).not.toContainText("'s home");
  await expect(status.getByRole("link", { name: "Go to Stuff Locator" })).toHaveAttribute("href", STUFF_PATH);

  // The critical assertion (AC #2): exactly one household, the inviter's —
  // not a bootstrap-created one in addition to it.
  expect(await countHouseholdsForUser(email, TEST_PASSWORD)).toBe(1);

  await status.getByRole("link", { name: "Go to Stuff Locator" }).click();
  await page.waitForURL(STUFF_PATH);
  await expect(page.getByRole("heading", { level: 1, name: "What are you looking for?" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("an already-signed-in visitor redeems automatically, with no sign-up/sign-in form shown", async ({ page }) => {
  const { code, householdId } = await seedInviteForNewHousehold("Itamar's home");
  const email = await signUpFreshAccount(page);

  await page.goto(`/join/${code}`);
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("button", { name: "Create account" })).toHaveCount(0);
  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText("Itamar's home")).toBeVisible();

  // Bootstrap gave this user an empty household at sign-up; redeem_invite
  // removes it on join (docs/adr/0008), so they end up in exactly one
  // household — the invited one.
  expect(await householdIdsForUser(email, TEST_PASSWORD)).toEqual([householdId]);
});

test("an invalid code shows a clear, specific error state, with no partial household created", async ({ page }) => {
  const email = `e2e-join-invalid-${randomUUID()}@example.com`;

  await page.goto("/join/this-code-does-not-exist");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();

  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(alert.getByText(/invite/i)).toBeVisible();
  await expect(alert.getByRole("link", { name: "Back to Stuff Locator" })).toHaveAttribute("href", STUFF_PATH);

  // Bootstrap's own fallback household still exists (this account isn't
  // stranded), but exactly one — no partial/duplicate household from the
  // failed redemption attempt.
  expect(await countHouseholdsForUser(email, TEST_PASSWORD)).toBe(1);
});

test("toggling to sign-in and joining via an existing account also redeems correctly", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  await signOutViaMenu(page);
  await page.waitForURL("/sign-in");

  const { code, householdId } = await seedInviteForNewHousehold("Shared home");

  await page.goto(`/join/${code}`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Already have an account? Sign in" }).click();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status.getByText("Shared home")).toBeVisible();
  // Their empty bootstrap household is removed on join (ADR 0008).
  expect(await householdIdsForUser(email, TEST_PASSWORD)).toEqual([householdId]);
});

test("joining a household that already has two people says so, and leaves the joiner in their own household", async ({
  page,
}) => {
  const { code, householdId } = await seedInviteForNewHousehold(`Full household ${randomUUID().slice(0, 8)}`);
  await addSeededPartner(householdId);
  const email = `e2e-join-full-${randomUUID()}@example.com`;

  await page.goto(`/join/${code}`);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Your name").fill("E2E Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  const alert = page.getByRole("alert");
  await expect(alert.getByText("This household already has two people in it")).toBeVisible();
  const households = await householdIdsForUser(email, TEST_PASSWORD);
  expect(households).toHaveLength(1);
  expect(households).not.toContain(householdId);
});
