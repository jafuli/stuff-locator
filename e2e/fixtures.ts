import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { test as base, expect, type BrowserContext } from "@playwright/test";
import { isModelRequest } from "../src/lib/search/model-hosts";

// Find downloads a ~23 MB embedding model (plus a ~5.5 MB wasm runtime) from
// third-party hosts the first time someone focuses the search box. A real
// download in every CI run would be slow and would tie the gate to those hosts
// being up, so specs never reach them by default:
//
//   "blocked" (default) - the model hosts are unreachable, so Find stays on
//       the substring filter. Every existing spec that types in the search
//       box is exactly as hermetic as before.
//   "cached" - the real model, served from a read-through disk cache
//       (e2e/.model-cache, gitignored, restored by actions/cache in CI). The
//       first run fetches from the real hosts and writes the cache; later runs
//       are offline. The real worker, the real model and the real Cache API
//       are all exercised either way.
//
// The service worker stays active, as in production. It deliberately doesn't
// answer model requests (src/app/sw.ts), so the browser performs them itself
// and Playwright can route them.

const CACHE_DIR = path.join(process.cwd(), "e2e", ".model-cache");

export type ModelNetwork = "blocked" | "cached";

/**
 * What navigator.connection reports, set by an init script so the idle
 * prefetch rule (src/lib/search/connection.ts) sees the same thing on every
 * machine. Headless Chromium otherwise reports whatever the runner's network
 * looks like.
 *   "3g" (default) - no background download; the model starts on focus. Keeps
 *       every spec that isn't about Find from fetching the model on load.
 *   "4g" - the model starts once the page is idle.
 *   "none" - no Network Information API (Safari, Firefox).
 *   "save-data" - Save-Data on a 4g connection; the model never starts.
 */
export type ConnectionProfile = "3g" | "4g" | "none" | "save-data";

async function installConnection(context: BrowserContext, profile: ConnectionProfile): Promise<void> {
  await context.addInitScript((value) => {
    Object.defineProperty(Navigator.prototype, "connection", {
      get: () => value ?? undefined,
      configurable: true,
    });
  }, connectionValueOf(profile));
}

function connectionValueOf(profile: ConnectionProfile): { effectiveType: string; saveData: boolean } | null {
  switch (profile) {
    case "3g":
      return { effectiveType: "3g", saveData: false };
    case "4g":
      return { effectiveType: "4g", saveData: false };
    case "save-data":
      return { effectiveType: "4g", saveData: true };
    case "none":
      return null;
  }
}

export interface ModelRoutes {
  /** How many requests to a model host the page made (in either mode). */
  requestCount(): number;
  /** True if "cached" mode needed a real download and the host couldn't be reached. */
  upstreamFailed(): boolean;
}

function cacheKey(url: string, range: string | undefined): string {
  return createHash("sha1")
    .update(`${url}|${range ?? ""}`)
    .digest("hex");
}

interface StoredResponse {
  status: number;
  headers: Record<string, string>;
}

async function installModelRoutes(context: BrowserContext, mode: ModelNetwork): Promise<ModelRoutes> {
  let requests = 0;
  let upstreamFailed = false;

  await context.route(
    (url) => isModelRequest(url),
    async (route) => {
      requests += 1;
      if (mode === "blocked") {
        await route.abort("blockedbyclient");
        return;
      }

      const request = route.request();
      const key = cacheKey(request.url(), request.headers().range);
      const metaPath = path.join(CACHE_DIR, `${key}.json`);
      const bodyPath = path.join(CACHE_DIR, `${key}.bin`);

      try {
        const [meta, body] = await Promise.all([readFile(metaPath, "utf8"), readFile(bodyPath)]);
        const stored = JSON.parse(meta) as StoredResponse;
        await route.fulfill({ status: stored.status, headers: stored.headers, body });
        return;
      } catch {
        // Not cached yet: fall through to the real host.
      }

      try {
        const response = await route.fetch();
        const body = await response.body();
        // Playwright hands back a decoded body, so the encoding and length
        // headers describing the wire format would now be wrong.
        const headers = Object.fromEntries(
          Object.entries(response.headers()).filter(
            ([name]) => name !== "content-encoding" && name !== "content-length",
          ),
        );
        await mkdir(CACHE_DIR, { recursive: true });
        await Promise.all([
          writeFile(bodyPath, body),
          writeFile(metaPath, JSON.stringify({ status: response.status(), headers } satisfies StoredResponse)),
        ]);
        await route.fulfill({ status: response.status(), headers, body });
      } catch {
        upstreamFailed = true;
        await route.abort("failed");
      }
    },
  );

  return { requestCount: () => requests, upstreamFailed: () => upstreamFailed };
}

export const test = base.extend<{
  modelNetwork: ModelNetwork;
  modelRoutes: ModelRoutes;
  connection: ConnectionProfile;
  connectionInstalled: undefined;
}>({
  modelNetwork: ["blocked", { option: true }],
  connection: ["3g", { option: true }],
  connectionInstalled: [
    async ({ context, connection }, use) => {
      await installConnection(context, connection);
      await use(undefined);
    },
    { auto: true },
  ],
  modelRoutes: [
    async ({ context, modelNetwork }, use) => {
      await use(await installModelRoutes(context, modelNetwork));
    },
    { auto: true },
  ],
});

export { expect };
export type { Page } from "@playwright/test";
