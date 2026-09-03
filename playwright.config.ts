import { defineConfig, devices } from "@playwright/test";

// The standing pre-merge UI-smoke gate (see docs/adr/0002-playwright-ui-smoke-gate.md).
// Deliberately chromium-only and deliberately narrow in scope — a smoke
// check that the app boots and the shell is usable, not a cross-browser or
// full-coverage E2E suite.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Self-contained (builds and starts the app itself) so `npm run
    // test:e2e` works standalone, locally or in CI, without depending on a
    // separate build step having already run in the same shell/job.
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
