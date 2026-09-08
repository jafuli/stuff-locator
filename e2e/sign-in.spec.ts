import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

// Runs against a real local Supabase stack — see sign-up.spec.ts's header
// comment. Each test creates its own fresh account through the real
// sign-up UI (no direct supabase-js calls from e2e) rather than assuming a
// seeded fixture user exists, since this task doesn't seed one.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-signin-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

test("sign-up, sign-out, and sign-in with the same credentials round-trip back to /", async ({ page }) => {
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
  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/sign-in");
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();

  await page.waitForURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("wrong password on a real account shows Supabase's actual error message, not a generic one", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("/sign-in");

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("definitely-the-wrong-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  // Scoped to the <form> — a bare page.getByRole("alert") also matches
  // Next's own route announcer (#__next-route-announcer__, role="alert",
  // aria-live="assertive"), which is a real, unrelated element on every
  // page and would make this a strict-mode violation otherwise.
  const form = page.locator("form");
  await expect(form.getByRole("alert")).toBeVisible();
  await expect(form.getByRole("alert")).toHaveText(/invalid/i);
  // Stays on /sign-in — a rejected sign-in never navigates away.
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("empty fields on sign-in show real inline errors and never navigate away", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByText("Enter your email address.")).toBeVisible();
  await expect(page.getByText("Enter your password.")).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("the sign-in form is keyboard-reachable in a sensible order with real label associations", async ({ page }) => {
  await page.goto("/sign-in");

  await page.getByLabel("Email").focus();
  await expect(page.getByLabel("Email")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeFocused();
});
