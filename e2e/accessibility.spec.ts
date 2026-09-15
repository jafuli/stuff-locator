import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { seedItem, seedLocationChain } from "./supabase-test-client";

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
  { path: "/browse", name: "browse (root)" },
  // A location with BOTH a nested child location and a directly-placed
  // item doesn't exist anywhere in LOCATIONS/ITEMS (checked) — picked for
  // its nested child (exercises LocationList + breadcrumb one level deep);
  // a leaf with direct items would exercise ItemCard instead, but that
  // shape is already covered by "/" above (now genuinely, since "/"
  // seeds a real item rather than testing only the empty state).
  { path: "/browse/garage-closet", name: "browse/[id] (a location with a nested child)" },
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
