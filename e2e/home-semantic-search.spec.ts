import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "./fixtures";
import { seedItem, seedLocationChain } from "./supabase-test-client";

// Find's embedding search, against a production build. How the model reaches
// the browser (a read-through disk cache vs. blocked) is e2e/fixtures.ts's job.
const TEST_PASSWORD = "correct-horse-battery-1";

async function signUpFreshAccount(page: Page): Promise<string> {
  const email = `e2e-semantic-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("/");
  return email;
}

async function seedHousehold(email: string): Promise<void> {
  const bedroom = await seedLocationChain(email, TEST_PASSWORD, ["Bedroom", "Filing box"]);
  const garage = await seedLocationChain(email, TEST_PASSWORD, ["Garage", "High shelf"]);
  const office = await seedLocationChain(email, TEST_PASSWORD, ["Office"]);
  await seedItem(email, TEST_PASSWORD, {
    name: "Passport",
    locationId: bedroom,
    detail: "with the birth certificates",
  });
  await seedItem(email, TEST_PASSWORD, { name: "Camping tent", locationId: garage, detail: "green bag, 4 person" });
  await seedItem(email, TEST_PASSWORD, { name: "Spare router", locationId: office });
  await seedItem(email, TEST_PASSWORD, { name: "Allen keys", locationId: garage });
  await seedItem(email, TEST_PASSWORD, { name: "Picnic blanket", locationId: garage, detail: "waterproof backing" });
}

// Result rows are the item links; their title is the first line of text.
const resultRows = (page: Page) => page.locator("main a[href^='/items/']:not([href='/items/new'])");

test.describe("with the real model", () => {
  test.use({ modelNetwork: "cached" });
  // First run downloads ~29 MB through the disk cache; later runs don't.
  test.setTimeout(150_000);

  test("a query sharing no words with its item still finds it, and CLOSEST follows the ranking", async ({
    page,
    modelRoutes,
  }) => {
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
    await seedHousehold(email);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Lazy: nothing about the model is requested just by loading the page.
    expect(modelRoutes.requestCount()).toBe(0);

    const search = page.getByRole("searchbox", { name: "Search your stuff" });
    await search.fill("travel documents");

    // No item contains either word, so the substring filter finds nothing
    // while the model loads...
    await expect(page.getByText("No matches")).toBeVisible();
    await expect.poll(() => modelRoutes.requestCount()).toBeGreaterThan(0);

    // ...and once it arrives the shortlist appears, Passport near the top.
    try {
      await expect(resultRows(page).first()).toBeVisible({ timeout: 120_000 });
    } catch (error) {
      test.skip(modelRoutes.upstreamFailed(), "the embedding model host could not be reached");
      throw error;
    }

    const topThree = await resultRows(page).evaluateAll((rows) =>
      rows.slice(0, 3).map((row) => row.querySelector(".text-title")?.textContent ?? ""),
    );
    expect(topThree).toContain("Passport");

    // CLOSEST is on exactly one row, and it is the first one.
    await expect(page.getByText("Closest", { exact: true })).toHaveCount(1);
    await expect(resultRows(page).first().getByText("Closest", { exact: true })).toBeVisible();

    // A ranked list ends with the closing line, never a "No matches" screen.
    await expect(page.getByText("Nothing else close.")).toBeVisible();
    await expect(page.getByText("No matches")).toHaveCount(0);

    // Meaning works for other items too, and the list re-ranks per query.
    await search.fill("somewhere to sleep outdoors");
    await expect(resultRows(page).first().locator(".text-title")).toHaveText("Camping tent");

    expect(consoleErrors).toEqual([]);
  });

  test("a substring hit stays on top while the person is still typing a word", async ({ page, modelRoutes }) => {
    const email = await signUpFreshAccount(page);
    await seedHousehold(email);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("searchbox", { name: "Search your stuff" }).fill("pass");

    // Two characters short of a real word for the model, but the substring
    // hit is immediate and needs no model at all.
    await expect(resultRows(page).first().locator(".text-title")).toHaveText("Passport");
    expect(modelRoutes.upstreamFailed()).toBe(false);
  });
});

test.describe("when the model is unavailable", () => {
  test("Find stays on the substring filter and nothing breaks", async ({ page, modelRoutes }) => {
    const email = await signUpFreshAccount(page);
    await seedHousehold(email);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const search = page.getByRole("searchbox", { name: "Search your stuff" });
    await search.fill("pass");
    await expect(resultRows(page)).toHaveCount(1);
    await expect(resultRows(page).first().locator(".text-title")).toHaveText("Passport");

    // The host was tried and refused; the page keeps working and still says
    // "No matches" honestly for a query only the model could have answered.
    await search.fill("travel documents");
    await expect(page.getByText("No matches")).toBeVisible();
    await expect.poll(() => modelRoutes.requestCount()).toBeGreaterThan(0);

    await search.fill("");
    await expect(resultRows(page)).toHaveCount(5);
  });
});

test.describe("Save-Data", () => {
  test.use({ modelNetwork: "cached" });

  test("does not download the model, and substring search still works", async ({ page, modelRoutes }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", {
        value: { saveData: true, effectiveType: "4g" },
        configurable: true,
      });
    });
    const email = await signUpFreshAccount(page);
    await seedHousehold(email);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const search = page.getByRole("searchbox", { name: "Search your stuff" });
    await search.fill("travel documents");
    await expect(page.getByText("No matches")).toBeVisible();
    // Give a wrongly-started worker time to reach the network.
    await page.waitForTimeout(1500);
    expect(modelRoutes.requestCount()).toBe(0);

    await search.fill("tent");
    await expect(resultRows(page).first().locator(".text-title")).toHaveText("Camping tent");
  });
});

test.describe("with the service worker active", () => {
  // Turbopack puts a worker's bootstrap config in its URL fragment, which a
  // service-worker response loses; src/app/sw.ts keeps worker entry requests
  // away from the service worker for that reason. Without that, the worker
  // dies on boot with "Missing worker bootstrap config".
  test("the embedding worker boots under a controlling service worker", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });
    const workerUrls: string[] = [];
    page.on("worker", (worker) => {
      workerUrls.push(worker.url());
    });

    const email = await signUpFreshAccount(page);
    await seedHousehold(email);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await navigator.serviceWorker.ready).active !== null && navigator.serviceWorker.controller !== null,
        ),
      )
      .toBe(true);

    await page.getByRole("searchbox", { name: "Search your stuff" }).focus();
    await expect.poll(() => workerUrls.length).toBeGreaterThan(0);
    // The worker's bootstrap runs immediately on start; give it a beat to fail.
    await page.waitForTimeout(1000);

    expect(workerUrls[0]).toContain("turbopack-worker");
    expect(consoleErrors.filter((text) => text.includes("Missing worker bootstrap config"))).toEqual([]);
  });
});
