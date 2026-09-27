import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { tabUntilFocused } from "./utils";

const TEST_PASSWORD = "correct-horse-battery-1";

// /activity is behind the session gate now (see
// docs/adr/0005-route-protection.md). It was genuinely reachable without
// an account before — it's fixture-backed, so nothing on it needed a
// session, which is exactly how it ended up as the one route the old
// per-page auth checks missed. The feed itself is still fixture-only, so
// a brand-new account sees the same entries this spec always asserted.
async function signUpFreshAccount(page: Page): Promise<void> {
  const email = `e2e-activity-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
}

test("the activity feed shows real entries, not the old placeholder, and links out correctly", async ({ page }) => {
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

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");

  await expect(page.getByRole("heading", { level: 1, name: "Activity" })).toBeVisible();
  await expect(page.getByText(/coming soon/i)).toHaveCount(0);

  // Spare house keys is the one fixture item with a genuine move — its
  // "moved" entry is the newest event, so it renders first (top <li>).
  // Several other items also live under Garage, so breadcrumb links are
  // scoped to this specific entry rather than matched by name alone.
  const topEntry = page.getByRole("listitem").first();
  await expect(topEntry.getByText("Maayan")).toBeVisible();
  await expect(topEntry.getByText("moved")).toBeVisible();

  // The item link points at its detail route — verified via href, not by
  // navigating in: item-detail now reads real data (see that task's PR)
  // and this fixture id ("spare-house-keys") was never something its real
  // reads could resolve. Activity itself is still fixture-only until its
  // own separate wiring task lands.
  await expect(topEntry.getByRole("link", { name: "Spare house keys" })).toHaveAttribute(
    "href",
    "/items/spare-house-keys",
  );

  // Clicking a breadcrumb segment in an entry links out to the matching
  // /browse/[id] — Browse itself now reads real household data (see that
  // task's PR), and Activity is still fixture-only, so this fixture id
  // ("garage") was never something Browse's real reads could resolve.
  // Matching home.spec.ts's own precedent for this exact coupling: only the
  // href is asserted here, not Browse's own rendered content.
  await expect(page.getByRole("listitem").first().getByRole("link", { name: "Garage" })).toHaveAttribute(
    "href",
    "/browse/garage",
  );

  expect(consoleErrors).toEqual([]);
});

test("an activity feed entry's item link is keyboard-reachable", async ({ page }) => {
  await signUpFreshAccount(page);
  await page.goto("/activity");
  expect(await tabUntilFocused(page, "Spare house keys", 20)).toBe(true);
});
