import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { countHouseholdsForUser } from "./supabase-test-client";
import { tabUntilFocused } from "./utils";

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

  // Regression coverage: the app's bottom nav (Stuff/Activity tabs +
  // sign-out control) used to render unconditionally, including here — the
  // tabs point at fixture-backed app content unrelated to signing up, and
  // showing "Sign out" on a page you can't be signed out of yet was its
  // own bug (see site-nav.tsx / sign-out-button.tsx). Neither belongs on
  // this standalone page, so the whole nav should be entirely absent.
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

  const email = `e2e-signup-${randomUUID()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  await page.waitForURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();

  // / is a real app route (not one of ROUTES_WITHOUT_NAV) and signUp()
  // actually returned a session, so the nav — tabs and sign-out alike —
  // is back.
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  expect(consoleErrors).toEqual([]);

  // The household-bootstrap call (POST /api/household/bootstrap, fired
  // right before this redirect) should have given this brand-new account
  // exactly one household — not zero (nothing called create_household) and
  // not more than one (create_household is intentionally non-idempotent;
  // see src/server/services/household.ts).
  expect(await countHouseholdsForUser(email, TEST_PASSWORD)).toBe(1);
});

test("a household-bootstrap failure still reaches / with a visible, keyboard-reachable notice", async ({ page }) => {
  // ensureHousehold itself runs server-side (inside the /api/household/
  // bootstrap route handler), so intercepting Supabase's own REST endpoint
  // from the browser wouldn't touch it at all — the request never leaves
  // the Next.js server process. Intercepting the form's own same-origin
  // call to that route handler is what the form actually depends on, and
  // is exactly the failure surface this test cares about: "the bootstrap
  // endpoint didn't return ok".
  await page.route("**/api/household/bootstrap", async (route) => {
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ ok: false }) });
  });

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto("/sign-up");
  const email = `e2e-signup-bootstrap-fail-${randomUUID()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  const alert = page.getByRole("alert").filter({ hasText: /couldn.t finish setting up your household/i });
  await expect(alert).toBeVisible();

  // Same convention as this file's own keyboard-reachability test: focus a
  // known field first, then prove the target is actually Tab-reachable
  // from there (rather than only checking it's focusable via .focus()).
  await page.getByLabel("Password").focus();
  expect(await tabUntilFocused(page, "Continue", 5)).toBe(true);

  // Non-blocking: even with no interaction, the auto-continue timer takes
  // this to / on its own — never traps the user on the auth page.
  await page.waitForURL("/", { timeout: 10_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();

  // The failure is genuinely observable, not silently swallowed.
  expect(consoleErrors.some((message) => /household-bootstrap/i.test(message))).toBe(true);
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
