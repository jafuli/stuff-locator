import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";
import { seedLocationChainAllIds, signedInClient } from "./supabase-test-client";
import { STUFF_PATH } from "@/lib/routes";

// Activity shows everything a household keeps (the newest 200 events), a
// page at a time: the newest 50, then "Show earlier activity" (ADR 0011
// amendment). Events are written through the real functions as the user.

const TEST_PASSWORD = "correct-horse-battery-1";

async function signUp(page: Page): Promise<string> {
  const email = `e2e-activity-pages-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Your name").fill("Noa");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(STUFF_PATH);
  return email;
}

test("the newest 50 first, then 'Show earlier activity' until everything kept is shown", async ({ page }) => {
  const email = await signUp(page);
  const [garage = "", attic = ""] = await seedLocationChainAllIds(email, TEST_PASSWORD, ["Garage", "Attic"]);
  const client = await signedInClient(email, TEST_PASSWORD);
  const { data: item, error } = await client.rpc("stash_item", { p_name: "Bike pump", p_location_id: garage });
  expect(error).toBeNull();
  // 1 added + 59 moves = 60 events: one full page and 10 more.
  for (let move = 0; move < 59; move += 1) {
    const { error: moveError } = await client.rpc("move_item", {
      p_item_id: item?.id ?? "",
      p_new_location_id: move % 2 === 0 ? attic : garage,
    });
    expect(moveError).toBeNull();
  }

  await page.goto("/activity");
  await page.waitForLoadState("networkidle");
  const entries = page.locator("main ol > li");
  await expect(entries).toHaveCount(50);

  const more = page.getByRole("button", { name: "Show earlier activity" });
  await more.focus();
  await page.keyboard.press("Enter");

  await expect(entries).toHaveCount(60);
  await expect(page.getByText("added Bike pump")).toBeVisible();
  await expect(more).toHaveCount(0);
  const end = page.getByText("That's everything: the newest 200 changes are kept.");
  await expect(end).toBeFocused();

  const results = await new AxeBuilder({ page }).analyze();
  const seriousOrWorse = results.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  expect(seriousOrWorse, JSON.stringify(seriousOrWorse, null, 2)).toEqual([]);
});
