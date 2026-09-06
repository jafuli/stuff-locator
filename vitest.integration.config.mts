import { defineConfig } from "vitest/config";

// Separate config for integration tests that talk to a live local Supabase
// stack (`npm run supabase:start`, Docker required) rather than jsdom/mocks.
// Kept out of vitest.config.mts's default include so plain `npm run test`
// (what CI runs) never needs Docker. Run these via `npm run test:rls`.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["supabase/tests/**/*.test.ts"],
  },
});
