import { MODEL_ID, MODEL_REVISION, MODEL_WEIGHTS_FILE } from "./embedding-protocol";

// Whether the model's weights are already in the browser, which makes starting
// the model a CPU-only cost. This mirrors transformers.js 4.x: it keeps
// downloads in the Cache API under `env.cacheKey` ("transformers-cache"), keyed
// by the full remote URL `${remoteHost}${model}/resolve/${revision}/${file}`
// (src/utils/hub.js, buildResourcePaths). If a library upgrade changes either,
// this check answers "not cached". That is safe: Find just waits for focus.

/** transformers.js's default `env.cacheKey`. */
export const TRANSFORMERS_CACHE_NAME = "transformers-cache";

/** The Cache API key transformers.js stores the pinned weights under. */
export function modelWeightsUrl(): string {
  return `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/${MODEL_WEIGHTS_FILE}`;
}

/** The slice of CacheStorage the check needs, so tests can hand in a fake. */
export interface CacheStorageLike {
  has(cacheName: string): Promise<boolean>;
  open(cacheName: string): Promise<{ match(request: string): Promise<Response | undefined> }>;
}

/**
 * True only if the pinned weights are definitely cached. Never throws: if there
 * is no Cache API (an insecure context, some private modes) or anything errors,
 * the answer is false. `has()` comes first so that checking never creates an
 * empty cache as a side effect of `open()`.
 */
export async function isModelCached(
  storage: CacheStorageLike | undefined = typeof caches === "undefined" ? undefined : caches,
): Promise<boolean> {
  if (!storage) {
    return false;
  }
  try {
    if (!(await storage.has(TRANSFORMERS_CACHE_NAME))) {
      return false;
    }
    const cache = await storage.open(TRANSFORMERS_CACHE_NAME);
    return (await cache.match(modelWeightsUrl())) !== undefined;
  } catch {
    return false;
  }
}
