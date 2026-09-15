import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { tabUntilFocused } from "./utils";
import { fetchLatestLinkForEmail } from "./mailpit-test-client";

// Runs against a real local Supabase stack — same stance as sign-in.spec.ts
// / sign-up.spec.ts: there's no way to fake Supabase Auth's
// password-recovery flow. Where a real emailed link is needed, this uses
// the local stack's own Mailpit relay (see mailpit-test-client.ts) to
// retrieve it, rather than mocking anything — the AC allows falling back
// to a mocked-session component test for that one path if it isn't
// practically achievable, but it is (verified while building this): the
// local stack's recovery link lands on http://localhost:3000/reset-password
// with the session in a URL fragment, exactly like a real deployment, once
// that redirect is added to supabase/config.toml's auth.additional_redirect_urls
// (see that file's own comment on why).

async function signUpFreshAccount(page: Page, password: string): Promise<string> {
  const email = `e2e-reset-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/sign-in");
  return email;
}

test("sign-in has a visible, keyboard-reachable 'Forgot your password?' link", async ({ page }) => {
  await page.goto("/sign-in");
  const link = page.getByRole("link", { name: "Forgot your password?" });
  await expect(link).toBeVisible();
  expect(await tabUntilFocused(page, "Forgot your password?", 10)).toBe(true);

  await link.click();
  await page.waitForURL("/forgot-password");
  await expect(page.getByRole("heading", { level: 1, name: "Reset your password" })).toBeVisible();
});

test("submitting a valid-looking email on /forgot-password shows the generic confirmation", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(`someone-${randomUUID()}@example.com`);
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(page.getByText(/if an account exists for that email/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
});

test("submitting an empty email on /forgot-password shows an inline validation error", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByRole("button", { name: "Send reset link" }).click();

  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("loading /reset-password directly with no recovery session shows the invalid-link state, not the form", async ({
  page,
}) => {
  await page.goto("/reset-password");

  await expect(page.getByText("This reset link is invalid or has expired")).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Request a new link" })).toBeVisible();
});

test("the full recovery flow: request a link, follow the real emailed link, set a new password, sign in with it", async ({
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

  const originalPassword = "correct-horse-battery-1";
  const newPassword = "a-brand-new-password-2";
  const email = await signUpFreshAccount(page, originalPassword);

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/if an account exists for that email/i)).toBeVisible();

  const link = await fetchLatestLinkForEmail(email);
  await page.goto(link);
  await page.waitForURL(/\/reset-password/);

  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Update password" }).click();

  await expect(page.getByText("Your password has been changed.")).toBeVisible();
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await page.waitForURL("/sign-in");

  // Proves the change actually took effect, not just that the UI claimed
  // success — signs in with the NEW password on the SAME account.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(newPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("empty and mismatched passwords on a real reset-password session show specific inline errors", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page, "correct-horse-battery-1");
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();

  const link = await fetchLatestLinkForEmail(email);
  await page.goto(link);
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Enter a password.")).toBeVisible();
  await expect(page.getByText("Confirm your new password.")).toBeVisible();

  await page.getByLabel("New password", { exact: true }).fill("longenough1");
  await page.getByLabel("Confirm new password").fill("a-different-one");
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page.getByText("Passwords don't match.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("the forgot-password form is keyboard-reachable in a sensible order", async ({ page }) => {
  await page.goto("/forgot-password");

  await page.getByLabel("Email").focus();
  await expect(page.getByLabel("Email")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send reset link" })).toBeFocused();
});

test("the reset-password form is keyboard-reachable in a sensible order", async ({ page }) => {
  const email = await signUpFreshAccount(page, "correct-horse-battery-1");
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();

  const link = await fetchLatestLinkForEmail(email);
  await page.goto(link);
  await expect(page.getByLabel("New password", { exact: true })).toBeVisible();

  await page.getByLabel("New password", { exact: true }).focus();
  await expect(page.getByLabel("New password", { exact: true })).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Confirm new password")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Update password" })).toBeFocused();
});
