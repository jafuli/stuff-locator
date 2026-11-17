import { spawnSync } from "node:child_process";
import { createSerwistRoute } from "@serwist/turbopack";

// A build-time revision string so Serwist knows when the offline fallback
// entry needs re-precaching. In order:
// 1. VERCEL_GIT_COMMIT_SHA, which Vercel sets on every Git-triggered build,
//    whether or not the build machine has a .git directory or a git binary;
// 2. `git rev-parse HEAD` (local and CI builds);
// 3. a random id, so a build never fails over this. The cost is only that
//    /~offline is re-precached on every deploy.
function buildRevision(): string {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha !== undefined && vercelSha !== "") {
    return vercelSha;
  }
  // `stdout` is typed as a string but is undefined when git isn't installed
  // at all (spawnSync reports ENOENT in `error` instead of throwing), so
  // check `error` before touching it.
  const git = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" });
  const sha = git.error === undefined ? git.stdout.trim() : "";
  return sha === "" ? crypto.randomUUID() : sha;
}

const revision = buildRevision();

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
