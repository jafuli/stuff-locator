import { test, expect } from "@playwright/test";

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
  await expect(page.getByText("Spare house keys")).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
