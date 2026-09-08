import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

// Runs against a real local Supabase stack — there's no way to fake
// Supabase Auth. `npm run supabase:start` must be running first; see the
// PR description and README's test:e2e row.
const TEST_PASSWORD = "correct-horse-battery-1";

test("a fresh sign-up reaches / directly, matching this project's configured auth behavior", async ({ page }) => {
  // supabase/config.toml has [auth.email] enable_confirmations = false
  // locally, so signUp() returns an active session immediately — this
  // asserts the actual configured behavior, not an assumption. If that
  // config ever flips to require confirmation, the app itself branches on
  // the real signUp response (see sign-up-form.tsx) and this test's
  // expectation would need updating alongside it.
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  await page.goto("/sign-up");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible();

  // Regression coverage: the sign-out control used to render unconditionally,
  // including here — confusing on a page you can't be signed out of yet,
  // and clicking it while already on /sign-in got its own loading state
  // stuck (see sign-out-button.tsx's comment). It should be entirely absent
  // until there's an actual session.
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

  const email = `e2e-signup-${randomUUID()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();

  // Now that signUp() actually returned a session, the control shows up.
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("empty fields show real inline errors and never navigate away", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Enter a password.")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-up$/);
});

test("an invalid email format shows a real inline error and never navigates away", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-up$/);
});

test("the sign-up form is keyboard-reachable in a sensible order with real label associations", async ({ page }) => {
  await page.goto("/sign-up");

  // getByLabel only matches a real programmatic label association (htmlFor
  // + id, here) — this is the DoD's "real <label>/<input> associations,
  // not placeholder-only labeling" proven directly, not just visually.
  await page.getByLabel("Email").focus();
  await expect(page.getByLabel("Email")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Create account" })).toBeFocused();
});
