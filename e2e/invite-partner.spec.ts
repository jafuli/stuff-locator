import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { tabUntilFocused } from "./utils";

// Invite-partner UI (/settings/invite) needs a real signed-in session (it
// redirects an unauthenticated visitor to /sign-in, same guard shape as
// Stash/Home's own real-data-wiring tasks) — every test signs up a fresh
// real account first, matching the account-per-test pattern already
// established in sign-in.spec.ts / sign-up.spec.ts / stash.spec.ts.
//
// Clipboard permissions: Chromium needs explicit grants for
// navigator.clipboard.writeText to actually succeed in a headless test
// context — scoped to this file only via test.use(), not the shared
// playwright.config.ts, since no other spec needs it.
test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<void> {
  const email = `e2e-invite-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
}

test("the app shell has a visible, keyboard-reachable entry point into the invite flow", async ({ page }) => {
  await signUpFreshAccount(page);

  const inviteLink = page.getByRole("link", { name: "Invite partner" });
  await expect(inviteLink).toBeVisible();
  // Raised like home.spec.ts's own equivalent check (AC #4 there) — Home's
  // fixture item list contributes many real tab stops (each item's own
  // link plus one per breadcrumb segment) before reaching the bottom nav
  // and this link, which sits right after it.
  expect(await tabUntilFocused(page, "Invite partner", 45)).toBe(true);

  await inviteLink.click();
  await page.waitForURL("/settings/invite");
  await expect(page.getByRole("heading", { level: 1, name: "Invite your partner" })).toBeVisible();
});

test("generating an invite shows a real code and link, and copying it shows a visible confirmation", async ({ page }) => {
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
  await page.goto("/settings/invite");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Invite your partner" })).toBeVisible();

  // The code is a 12-char hex string (pgcrypto's gen_random_bytes(6),
  // hex-encoded — see the invites migration) — matched by shape, not a
  // fixed value, since it's freshly generated per household. Queried by
  // its own text content (not a CSS class) to stay consistent with this
  // repo's accessible-query testing convention.
  const codeText = await page.getByText(/^[0-9a-f]{12}$/).textContent();
  expect(codeText).toMatch(/^[0-9a-f]{12}$/);
  if (!codeText) {
    throw new Error("expected a real invite code to be rendered");
  }

  const linkText = await page.getByText(/\/join\//).textContent();
  expect(linkText).toContain(`/join/${codeText}`);

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Copied!")).toBeVisible();

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(linkText);

  expect(consoleErrors).toEqual([]);
});

test("reloading the invite page reuses the same code instead of generating a new one", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/settings/invite");
  await page.waitForLoadState("networkidle");

  const firstCode = await page.getByText(/^[0-9a-f]{12}$/).textContent();

  await page.reload();
  await page.waitForLoadState("networkidle");
  const secondCode = await page.getByText(/^[0-9a-f]{12}$/).textContent();

  expect(secondCode).toBe(firstCode);
});

test("the invite panel, including the copy button, is operable keyboard-only", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/settings/invite");
  await page.waitForLoadState("networkidle");

  expect(await tabUntilFocused(page, "Copy link", 10)).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByText("Copied!")).toBeVisible();
});
