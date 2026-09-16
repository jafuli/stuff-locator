import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedItem, seedLocationChain, seedLocationChainAllIds } from "./supabase-test-client";

const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-a11y-home-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

// Home now reads real household data and redirects an unauthenticated
// visitor to /sign-in (see home.spec.ts) — signs up a fresh account and
// seeds one real item so this genuinely scans Home's *populated* state,
// not the sign-in redirect or an empty list. Seeding a real row here
// (rather than just testing the empty state) matters specifically because
// ItemCard's linkLocationSegments mode — a distinct DOM shape used only on
// Home (see item-card.tsx's own "AC #4, home page only" comment) — isn't
// exercised by any other route in this file: browse/[id] below is
// deliberately a location with no direct items (its own comment explains
// why), and item-detail doesn't use ItemCard at all.
async function signUpAndSeedHomeItem(page: Page): Promise<void> {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Garage"]);
  await seedItem(email, TEST_PASSWORD, { name: `Spare key ${randomUUID()}`, locationId });
}

// Browse now reads real household data (see this task's PR description) —
// a fresh account has zero locations, so this genuinely scans the real
// "No rooms yet" empty state, not the impossible-with-fixtures branch the
// old comment here used to describe.
async function signUpOnly(page: Page): Promise<void> {
  await signUpFreshAccount(page);
}

// Automated accessibility pass (axe-core) across every currently-merged
// route with real content. Explicitly out of scope: the three fixture-only
// routes not yet merged as of this task (/items/new, /locations/new,
// /items/[id]/edit) — a natural follow-up once they land. Also out of
// scope: any manual/subjective accessibility review beyond what axe
// catches — this is an automated-tooling pass, not a substitute for a
// manual screen-reader pass.
//
// Every rule still runs (no `disableRules`, no ruleset filtering) — a
// violation only stops failing the test if it's genuinely fixed. Only the
// pass/fail threshold is impact-gated: axe's own "moderate"/"minor"
// findings are logged (via the failure message, if the test ever does
// fail) but don't fail the build, per the AC's "critical or serious" bar.
const ROUTES: { path: string; name: string; setup?: (page: Page) => Promise<void> }[] = [
  { path: "/", name: "home (populated, real household state)", setup: signUpAndSeedHomeItem },
  // Browse now reads real household data too (see this task's PR
  // description) — a fresh account has zero locations, so this scans the
  // real empty state. The "a location with a nested child" case moved to
  // its own standalone test below the loop: it needs a real seeded id
  // computed at test time, which this table's static `path` string can't
  // express.
  { path: "/browse", name: "browse (root)", setup: signUpOnly },
  { path: "/activity", name: "activity" },
  { path: "/items/passport", name: "item detail" },
  { path: "/this-route-does-not-exist", name: "root not-found" },
  { path: "/~offline", name: "offline fallback" },
];

for (const route of ROUTES) {
  test(`${route.name} (${route.path}) has no critical or serious axe violations`, async ({ page }) => {
    if (route.setup) {
      await route.setup(page);
    }

    await page.goto(route.path);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page }).analyze();
    const seriousOrWorse = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );

    expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toEqual([]);
  });
}

// A location with a nested child location — exercises LocationList +
// breadcrumb one level deep. Needs a real seeded id (computed at test time),
// which the static ROUTES table above can't express, so this lives as its
// own test rather than a table entry. A leaf with direct items would
// exercise ItemCard instead, but that shape is already covered by "/" above.
test("browse/[id] (a location with a nested child) has no critical or serious axe violations", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const [parentId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Garage", "Closet"]);

  await page.goto(`/browse/${parentId}`);
  await page.waitForLoadState("networkidle");

  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrWorse = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );

  expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toEqual([]);
});
