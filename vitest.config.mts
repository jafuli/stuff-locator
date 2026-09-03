import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    // Without this, Vitest's default glob also picks up e2e/*.spec.ts and
    // tries to run it as a Vitest test — it imports Playwright's
    // incompatible test()/expect(), so it fails immediately.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
