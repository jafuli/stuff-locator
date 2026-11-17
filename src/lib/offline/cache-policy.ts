// The offline cache policy for signed-in data, shared by the service worker
// (src/app/sw.ts) and the page (clear-private-caches.ts). See
// docs/adr/0014-offline-cache-policy-for-signed-in-data.md.
//
// Every runtime cache that can hold household data — a rendered page, an RSC
// payload, a prefetch — is named here, and these are the only names the
// sign-out / user-switch clearing deletes. They are deliberately the same
// names Serwist's `defaultCache` used (node_modules/@serwist/turbopack/dist/
// index.worker.mjs), so an install that ran the old worker gets its leftovers
// purged by the same list. `apis` and `cross-origin` are no longer written
// (src/lib/offline/runtime-caching.ts sends both to the network only) but stay
// on the list for exactly that reason.
//
// Not on the list, so kept across sign-out: Serwist's precache (the app shell
// and /~offline), the static-asset caches, and transformers.js's
// "transformers-cache" (the embedding model and wasm runtime — no household
// data, and ~23 MB to download again).
export const PRIVATE_CACHE_NAMES = [
  "pages-rsc-prefetch",
  "pages-rsc",
  "pages",
  "others",
  "apis",
  "cross-origin",
] as const;

export type PrivateCacheName = (typeof PRIVATE_CACHE_NAMES)[number];

/** The message a page posts to the service worker to clear the private caches. */
export const CLEAR_PRIVATE_CACHES = "CLEAR_PRIVATE_CACHES";

export interface ClearPrivateCachesMessage {
  type: typeof CLEAR_PRIVATE_CACHES;
}

export function isClearPrivateCachesMessage(data: unknown): data is ClearPrivateCachesMessage {
  return typeof data === "object" && data !== null && "type" in data && data.type === CLEAR_PRIVATE_CACHES;
}

/** Deletes every private cache. A cache that doesn't exist is not an error. */
export async function deletePrivateCaches(storage: CacheStorage): Promise<void> {
  await Promise.all(PRIVATE_CACHE_NAMES.map((name) => storage.delete(name)));
}
