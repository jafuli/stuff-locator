import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
const ROUTES: { path: string; name: string }[] = [
  { path: "/", name: "home (populated fixture state)" },
  { path: "/browse", name: "browse (root)" },
  // A location with BOTH a nested child location and a directly-placed
  // item doesn't exist anywhere in LOCATIONS/ITEMS (checked) — picked for
  // its nested child (exercises LocationList + breadcrumb one level deep);
  // a leaf with direct items would exercise ItemCard instead, but that
  // shape is already covered by "/" above.
  { path: "/browse/garage-closet", name: "browse/[id] (a location with a nested child)" },
  { path: "/activity", name: "activity" },
  { path: "/items/passport", name: "item detail" },
  { path: "/this-route-does-not-exist", name: "root not-found" },
  { path: "/~offline", name: "offline fallback" },
];

for (const route of ROUTES) {
  test(`${route.name} (${route.path}) has no critical or serious axe violations`, async ({ page }) => {
    await page.goto(route.path);
    await page.waitForLoadState("networkidle");

    const results = await new AxeBuilder({ page }).analyze();
    const seriousOrWorse = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );

    expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toEqual([]);
  });
}
