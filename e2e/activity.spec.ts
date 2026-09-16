import { test, expect } from "@playwright/test";
import { tabUntilFocused } from "./utils";

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

  // Clicking the item link lands on its detail route.
  await topEntry.getByRole("link", { name: "Spare house keys" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Spare house keys" })).toBeVisible();

  await page.goBack();
  await page.waitForLoadState("networkidle");

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
  await page.goto("/activity");
  expect(await tabUntilFocused(page, "Spare house keys", 20)).toBe(true);
});
