import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  seedInviteForNewHousehold,
  seedItem,
  seedLocationChain,
  seedLocationChainAllIds,
  signedInClient,
} from "./supabase-test-client";

const TEST_PASSWORD = "correct-horse-battery-1";

const COLOR_SCHEMES = ["light", "dark"] as const;

// Scans the page that is already set up, once per theme. The Label Maker
// design system ships light and dark palettes that follow the OS, so a
// contrast failure can live in just one of them — emulating each scheme on
// the same page is cheaper than re-seeding the whole test twice.
async function expectNoSeriousAxeViolations(page: Page): Promise<void> {
  for (const colorScheme of COLOR_SCHEMES) {
    // reducedMotion matters here: colours transition for 150ms, and axe would
    // otherwise sample a half-way blend right after the scheme flips.
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    // Two frames: lets the restyle (and the now-instant transitions) land.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        }),
    );
    const results = await new AxeBuilder({ page }).analyze();
    const seriousOrWorse = results.violations.filter(
      (violation) => violation.impact === "critical" || violation.impact === "serious",
    );
    expect(seriousOrWorse, `${colorScheme}: ${JSON.stringify(seriousOrWorse, null, 2)}`).toEqual([]);
  }
}

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

// /activity reads the activity_events log, which only the write functions
// append to — so this goes through them (signed in as the new account)
// instead of the service-role seeding above, and produces one of each kind of
// row layout: a path line, a from → to line, a detail quote and plain text.
async function signUpAndGenerateActivity(page: Page): Promise<void> {
  const email = await signUpFreshAccount(page);
  const client = await signedInClient(email, TEST_PASSWORD);
  const tag = randomUUID().slice(0, 8);
  const unwrap = <T>(result: { data: T | null; error: { message: string } | null }): T => {
    if (result.error || result.data === null) {
      throw new Error(result.error?.message ?? "no data");
    }
    return result.data;
  };
  const item = unwrap(await client.rpc("stash_item", { p_name: `Tent ${tag}`, p_new_path: ["Garage", "Shelf"] }));
  const attic = unwrap(await client.rpc("create_location", { p_name: `Attic ${tag}` }));
  unwrap(await client.rpc("move_item", { p_item_id: item.id, p_new_location_id: attic.id }));
  unwrap(
    await client.rpc("update_item", { p_item_id: item.id, p_name: `Tent (blue) ${tag}`, p_detail: "poles inside" }),
  );
  unwrap(await client.rpc("rename_location", { p_location_id: attic.id, p_name: `Loft ${tag}` }));
  const doomed = unwrap(await client.rpc("stash_item", { p_name: `Charger ${tag}`, p_location_id: attic.id }));
  unwrap(await client.rpc("delete_item", { p_item_id: doomed.id }));
}

// Browse now reads real household data (see this task's PR description) —
// a fresh account has zero locations, so this genuinely scans the real
// "No rooms yet" empty state, not the impossible-with-fixtures branch the
// old comment here used to describe.
async function signUpOnly(page: Page): Promise<void> {
  await signUpFreshAccount(page);
}

// Automated accessibility pass (axe-core) across every currently-merged
// route with real content. Item detail and Edit-item are both real now too
// (see this task's PR description) — their own dynamic-id tests live below
// the loop, same reason the "nested child" Browse case does: a real seeded
// id can't be a static path in this table. Explicitly out of scope: any
// manual/subjective accessibility review beyond what axe catches — this is
// an automated-tooling pass, not a substitute for a manual screen-reader
// pass.
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
  // Both of these need a session now that the app is deny-by-default
  // (docs/adr/0006-route-protection.md). Without `setup` they'd redirect
  // to /sign-in and axe would happily scan *that* page and pass — a
  // vacuous test, not a failing one. /~offline needs no setup: the proxy
  // matcher excludes it.
  { path: "/activity", name: "activity (populated)", setup: signUpAndGenerateActivity },
  { path: "/this-route-does-not-exist", name: "root not-found", setup: signUpOnly },
  { path: "/~offline", name: "offline fallback" },
];

for (const route of ROUTES) {
  test(`${route.name} (${route.path}) has no critical or serious axe violations in light and dark`, async ({
    page,
  }) => {
    if (route.setup) {
      await route.setup(page);
    }

    await page.goto(route.path);
    await page.waitForLoadState("networkidle");

    await expectNoSeriousAxeViolations(page);
  });
}

// A location with a nested child location — exercises LocationList +
// breadcrumb one level deep. Needs a real seeded id (computed at test time),
// which the static ROUTES table above can't express, so this lives as its
// own test rather than a table entry. A leaf with direct items would
// exercise ItemCard instead, but that shape is already covered by "/" above.
test("browse/[id] (a location with a nested child) has no critical or serious axe violations in light and dark", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const [parentId] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Garage", "Closet"]);

  await page.goto(`/browse/${parentId}`);
  await page.waitForLoadState("networkidle");

  await expectNoSeriousAxeViolations(page);
});

// Item detail and Edit-item both need a real seeded item id (computed at
// test time), which the static ROUTES table above can't express, so they
// live as their own tests rather than table entries — same reason the
// "nested child" Browse case does above.
test("item detail (real seeded item) has no critical or serious axe violations in light and dark", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, {
    name: "Passport",
    detail: "with the birth certificates",
    locationId,
  });

  await page.goto(`/items/${itemId}`);
  await page.waitForLoadState("networkidle");

  await expectNoSeriousAxeViolations(page);
});

test("item edit (real seeded item) has no critical or serious axe violations in light and dark", async ({ page }) => {
  const email = await signUpFreshAccount(page);
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const itemId = await seedItem(email, TEST_PASSWORD, { name: "Passport", locationId });

  await page.goto(`/items/${itemId}/edit`);
  await page.waitForLoadState("networkidle");

  await expectNoSeriousAxeViolations(page);
});

// The path picker in its busiest state: chips (solid and dashed), an open
// listbox with a "Matches anywhere" group, an "already here" row and a create
// row. The default scan above only sees the picker closed.
test("add item with the path picker open and chips built has no critical or serious axe violations in light and dark", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  await seedLocationChain(email, TEST_PASSWORD, ["Office", "Cabinet", "Top drawer"]);
  await seedLocationChain(email, TEST_PASSWORD, ["Kitchen", "Spice cabinet"]);

  await page.goto("/items/new");
  await page.waitForLoadState("networkidle");

  await page.getByRole("combobox").fill("Office");
  await page.getByRole("option", { name: "Office, already here" }).click();
  await page.getByRole("combobox").fill("Shelf");
  await page.getByRole("option", { name: "New place 'Shelf' inside Office" }).click();
  await page.getByRole("combobox").fill("cab");
  await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();

  await expectNoSeriousAxeViolations(page);
});

// /join/[code] needs a real, redeemable invite code (computed at test
// time), which the static ROUTES table above can't express, so it lives as
// its own test — same reason the other dynamic-id cases above do.
// Signed-out state, the route's default entry point (see join-invite.spec.ts
// for the already-signed-in variant).
test("join a household (/join/[code], signed out) has no critical or serious axe violations in light and dark", async ({
  page,
}) => {
  const { code } = await seedInviteForNewHousehold("A11y test household");

  await page.goto(`/join/${code}`);
  await page.waitForLoadState("networkidle");

  await expectNoSeriousAxeViolations(page);
});
