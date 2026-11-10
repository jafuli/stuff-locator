import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// A build-time revision string so Serwist knows when the offline fallback
// entry needs re-precaching. Falls back to a random id outside a git checkout
// (e.g. some CI/deploy contexts) rather than failing the build.
const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout.trim() || crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  additionalPrecacheEntries: [{ url: "/~offline", revision }],
  // The default globPatterns include "public/**/*", which would precache the
  // ~40 MB onnxruntime wasm that scripts/copy-ort.mjs puts in public/ort/.
  // transformers.js caches it itself, and only once someone searches. The
  // first entry is Serwist's own default, kept.
  globIgnores: ["**/node_modules/**/*", "public/ort/**/*"],
  swSrc: "src/app/sw.ts",
  useNativeEsbuild: true,
});
