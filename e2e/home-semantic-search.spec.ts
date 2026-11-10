import { randomUUID } from "node:crypto";
import { test, expect, type ModelRoutes, type Page } from "./fixtures";
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

/** Runs `body`, but turns a failure caused by an unreachable model host into a logged skip. */
async function unlessHostUnreachable(modelRoutes: ModelRoutes, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (error) {
    if (modelRoutes.upstreamFailed()) {
      // Printed so a CI log says plainly that the real-model checks did not run.
      console.log(`[find e2e] SKIPPED "${test.info().title}": the embedding model host could not be reached`);
      test.skip(true, "the embedding model host could not be reached");
    }
    throw error;
  }
}

async function topTitles(page: Page, count: number): Promise<string[]> {
  return resultRows(page).evaluateAll(
    (rows, n) => rows.slice(0, n).map((row) => row.querySelector(".text-title")?.textContent ?? ""),
    count,
  );
}

test.describe("with the real model", () => {
  test.use({ modelNetwork: "cached" });
  // First run downloads the model through the disk cache; later runs don't.
  test.setTimeout(150_000);

  test.describe("on a 4g connection", () => {
    test.use({ connection: "4g" });

    test("the model starts on idle, so the first meaning-only search needs no wait", async ({
      page,
      context,
      modelRoutes,
    }) => {
      // Every request the page and its workers make, to check where the wasm
      // runtime came from.
      const requestUrls: string[] = [];
      const wasmResponses: { url: string; status: number; encoding: string | undefined }[] = [];
      context.on("request", (request) => {
        requestUrls.push(request.url());
      });
      context.on("response", (response) => {
        if (response.url().endsWith(".wasm")) {
          wasmResponses.push({
            url: response.url(),
            status: response.status(),
            encoding: response.headers()["content-encoding"],
          });
        }
      });
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

      await unlessHostUnreachable(modelRoutes, async () => {
        // Nobody has touched the search box, and the model is on its way.
        await expect.poll(() => modelRoutes.requestCount(), { timeout: 15_000 }).toBeGreaterThan(0);
        // Let the download and model start-up finish while the person is
        // still looking at the page.
        await page.waitForLoadState("networkidle", { timeout: 120_000 });
        await page.waitForTimeout(1500);

        const search = page.getByRole("searchbox", { name: "Search your stuff" });
        await search.fill("travel documents");
        // No item shares a word with this query. With the model already up it
        // ranks almost at once (debounce + a few ms of embedding).
        await expect(resultRows(page).first()).toBeVisible({ timeout: 5_000 });
      });

      expect(await topTitles(page, 3)).toContain("Passport");
      // Nothing in Passport's name or detail matches those words, so the row
      // says how it got there.
      const passportRow = page.locator("main div.border-b", { has: page.getByText("Passport", { exact: true }) });
      await expect(passportRow.getByText("matched on meaning")).toBeVisible();
      await expect(page.getByText("Nothing else close.")).toBeVisible();
      await expect(page.getByText("No matches")).toHaveCount(0);

      // Meaning works for other items too, and the list re-ranks per query.
      await page.getByRole("searchbox", { name: "Search your stuff" }).fill("somewhere to sleep outdoors");
      await expect(resultRows(page).first().locator(".text-title")).toHaveText("Camping tent");

      // The wasm runtime came from this app (public/ort/<version>/), compressed,
      // and nothing went to jsDelivr.
      const runtime = new RegExp(`^${new URL(page.url()).origin}/ort/[^/]+/ort-wasm-simd-threaded\\.asyncify\\.wasm$`);
      const fromOrt = wasmResponses.filter((response) => runtime.test(response.url));
      expect(fromOrt.length).toBeGreaterThan(0);
      expect(fromOrt.every((response) => response.status === 200)).toBe(true);
      expect(wasmResponses.every((response) => response.encoding !== undefined)).toBe(true);
      expect(requestUrls.filter((url) => url.includes("cdn.jsdelivr.net"))).toEqual([]);

      expect(consoleErrors).toEqual([]);
    });
  });

  test.describe("on 3g", () => {
    test.use({ connection: "3g" });

    test("nothing is fetched until the search box is focused", async ({ page, modelRoutes }) => {
      const email = await signUpFreshAccount(page);
      await seedHousehold(email);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      // Well past the idle callback.
      await page.waitForTimeout(1500);
      expect(modelRoutes.requestCount()).toBe(0);

      await page.getByRole("searchbox", { name: "Search your stuff" }).focus();
      await expect.poll(() => modelRoutes.requestCount()).toBeGreaterThan(0);
    });

    test("once the model is cached, the next visit warms it on idle, untouched", async ({ page, modelRoutes }) => {
      const workers: string[] = [];
      page.on("worker", (worker) => {
        workers.push(worker.url());
      });
      const email = await signUpFreshAccount(page);
      await seedHousehold(email);
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // First visit: 3g, so the model only comes when asked for.
      const search = page.getByRole("searchbox", { name: "Search your stuff" });
      await search.fill("travel documents");
      await unlessHostUnreachable(modelRoutes, async () => {
        await expect(resultRows(page).first()).toBeVisible({ timeout: 120_000 });
      });

      // Second visit, still 3g: the weights are in the Cache API now, so the
      // model starts on idle without anyone touching the search box...
      workers.length = 0;
      const requestsBefore = modelRoutes.requestCount();
      await page.goto("/");
      await expect.poll(() => workers.length, { timeout: 15_000 }).toBeGreaterThan(0);
      // ...and without downloading anything again.
      await page.waitForLoadState("networkidle");
      expect(modelRoutes.requestUrls().slice(requestsBefore)).toEqual([]);

      await page.getByRole("searchbox", { name: "Search your stuff" }).fill("somewhere to sleep outdoors");
      await expect(resultRows(page).first().locator(".text-title")).toHaveText("Camping tent", { timeout: 10_000 });
    });
  });

  test.describe("without the Network Information API", () => {
    test.use({ connection: "none" });

    test("nothing is fetched until the search box is focused", async ({ page, modelRoutes }) => {
      const email = await signUpFreshAccount(page);
      await seedHousehold(email);
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
      expect(modelRoutes.requestCount()).toBe(0);

      await page.getByRole("searchbox", { name: "Search your stuff" }).focus();
      await expect.poll(() => modelRoutes.requestCount()).toBeGreaterThan(0);
    });
  });

  test("a substring hit stays on top while the person is still typing a word", async ({ page, modelRoutes }) => {
    const email = await signUpFreshAccount(page);
    await seedHousehold(email);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    await page.getByRole("searchbox", { name: "Search your stuff" }).fill("pass");

    // Too short for the model, but the substring hit is immediate and needs
    // no model at all. A letter match never carries the meaning label.
    await expect(resultRows(page).first().locator(".text-title")).toHaveText("Passport");
    await expect(page.getByText("matched on meaning")).toHaveCount(0);
    expect(modelRoutes.upstreamFailed()).toBe(false);
  });
});

test.describe("when the model is unavailable", () => {
  test("Find stays on the typo-tolerant lexical ranking and nothing breaks", async ({ page, modelRoutes }) => {
    const email = await signUpFreshAccount(page);
    await seedHousehold(email);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const search = page.getByRole("searchbox", { name: "Search your stuff" });
    await search.fill("pass");
    await expect(resultRows(page)).toHaveCount(1);
    await expect(resultRows(page).first().locator(".text-title")).toHaveText("Passport");

    // A typo still finds it: the lexical ranking is typo-tolerant on its own.
    await search.fill("pasport");
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
  test.use({ modelNetwork: "cached", connection: "save-data" });

  test("does not download the model, even after focus, and substring search still works", async ({
    page,
    modelRoutes,
  }) => {
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
  test("the self-hosted wasm runtime is never precached", async ({ page }) => {
    const response = await page.request.get("/serwist/sw.js");
    expect(response.ok()).toBe(true);
    const source = await response.text();
    // The precache manifest is inlined into the built service worker. ("/ort/"
    // itself appears in its code, as the prefix it leaves alone, so look for
    // the file names.)
    expect(source).toContain("~offline");
    expect(source).not.toContain("ort-wasm-simd-threaded");
  });

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
