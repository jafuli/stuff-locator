import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "./fixtures";
import { seedItem, seedLocationChain } from "./supabase-test-client";
import { STUFF_PATH } from "@/lib/routes";

// Home's search now filters real household items (see home.spec.ts's
// header comment for why every test here signs up first) instead of the
// ITEMS fixture — filterItems itself (src/lib/fixtures/search.ts) is
// unchanged and structurally source-agnostic, so this only needed real
// data to search over, not a rewrite of the search wiring itself.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-home-search-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(STUFF_PATH);
  return email;
}

test("searching the home item list filters, shows no-matches, and clears back to the full list", async ({ page }) => {
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
  const passportName = `Passport ${randomUUID()}`;
  const keysName = `Spare house keys ${randomUUID()}`;
  const locationId = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom"]);
  await seedItem(email, TEST_PASSWORD, { name: passportName, locationId });
  await seedItem(email, TEST_PASSWORD, { name: keysName, locationId });

  await page.goto(STUFF_PATH);
  await page.waitForLoadState("networkidle");

  const search = page.getByRole("searchbox", { name: "Search your stuff" });
  await expect(search).toBeVisible();

  // Search comes first in the tab order, then the Stash button beside it —
  // reading order. Checked before any .fill() below, since Playwright's
  // fill() focuses its target — a Tab afterwards would move focus past it,
  // not onto it. Not using tabUntilFocused for the search input itself: that
  // helper matches by aria-label or textContent, and this input is labelled
  // via an associated <label htmlFor>, which contributes neither.
  await page.keyboard.press("Tab");
  const focusedId = await page.evaluate(() => document.activeElement?.id ?? null);
  expect(focusedId).toBe("stuff-search");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Stash", exact: true })).toBeFocused();

  // A query matching exactly one real item narrows the list to it.
  await search.fill("passport");
  await expect(page.getByText(passportName)).toBeVisible();
  await expect(page.getByText(keysName)).toHaveCount(0);

  // A query matching nothing shows the dedicated no-matches empty state.
  await search.fill("this matches nothing at all");
  await expect(page.getByText("No matches")).toBeVisible();

  // Clearing the input restores the full original list.
  await search.fill("");
  await expect(page.getByText(passportName)).toBeVisible();
  await expect(page.getByText(keysName)).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("one or two letters already find items by their place ('of' -> what's in the Office), on Stuff and on Browse", async ({
  page,
}) => {
  const email = await signUpFreshAccount(page);
  const tag = randomUUID().slice(0, 8);
  const keysName = `Spare keys ${tag}`;
  const pumpName = `Bike pump ${tag}`;
  const cabinet = await seedLocationChain(email, TEST_PASSWORD, ["Office", "Cabinet"]);
  const garage = await seedLocationChain(email, TEST_PASSWORD, ["Garage"]);
  await seedItem(email, TEST_PASSWORD, { name: keysName, locationId: cabinet });
  await seedItem(email, TEST_PASSWORD, { name: pumpName, locationId: garage });

  for (const path of [STUFF_PATH, "/browse"]) {
    await page.goto(path);
    const search = page.getByRole("searchbox", { name: "Search your stuff" });
    await expect(search).toBeEnabled();

    // Two letters: below the model's 3-character minimum, so this is the
    // letter matching alone, now reaching the place path.
    await search.fill("of");
    await expect(page.getByText(keysName)).toBeVisible();
    await expect(page.getByText(pumpName)).toHaveCount(0);
  }
});
