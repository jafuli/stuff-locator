import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

const TEST_PASSWORD = "correct-horse-battery-1";

// This test's "Back to Stuff" link lands on "/", which now reads real
// household data and redirects an unauthenticated visitor to /sign-in
// instead (see home.spec.ts) — signing up first keeps this test's own
// point (the app's 404 page links back to a working Home) intact.
async function signUpFreshAccount(page: Page): Promise<void> {
  const email = `e2e-not-found-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
}

// Unlike a segment-level notFound() (items/[id], browse/[id] — both return
// 200, verified against this Next version's actual build output), an
// unmatched route hitting the root not-found.tsx gets a real HTTP 404 from
// the server — the correct behavior for a genuine 404 page. Chromium logs
// that as a "Failed to load resource: ... 404" console entry for the
// top-level document request itself; it's the browser correctly reporting
// the (deliberately correct) status code, not a JS error, so it's filtered
// out of this spec's console-error assertion rather than causing a false
// failure.
const EXPECTED_DOCUMENT_404_MESSAGE = /Failed to load resource.*404/;

test("an unmatched route renders the app's own 404, not Next's default, and links back to Stuff", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && !EXPECTED_DOCUMENT_404_MESSAGE.test(msg.text())) {
      consoleErrors.push(msg.text());
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(err.message);
  });

  await signUpFreshAccount(page);

  const response = await page.goto("/this-route-does-not-exist");
  await page.waitForLoadState("networkidle");

  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByText("That link doesn't go anywhere. It may be a typo or an old bookmark.")).toBeVisible();

  // Not any other route's not-found copy.
  await expect(page.getByText("Item not found")).toHaveCount(0);
  await expect(page.getByText("Location not found")).toHaveCount(0);

  await page.getByRole("link", { name: "Back to Stuff" }).click();
  await page.waitForLoadState("networkidle");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Our stuff" })).toBeVisible();
  // Not "Spare house keys" or any other route's content — beyond that,
  // what a brand-new signed-up account's household shows here (Guided
  // onboarding, since it has zero items — see guided-onboarding.spec.ts)
  // isn't this test's own point, which is only that "Back to Stuff" lands
  // on a working Home.

  expect(consoleErrors).toEqual([]);
});
