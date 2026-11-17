import type { SerwistPlugin } from "serwist";

// Closes the gap between "the private caches were just cleared" and "a
// request that was already in flight finishes and writes its response back".
// Without it, a link prefetch started a moment before sign-out could land the
// previous user's page in a freshly emptied cache.
//
// The service worker keeps one counter, bumped on every clear. Each request
// handled by a private-cache strategy records the counter when it starts
// (Serwist gives every plugin a fresh `state` object per request) and is
// refused a cache write if the counter has moved by the time its response
// arrives. cacheDidUpdate repeats the check after the write, for a clear that
// lands between cacheWillUpdate and the actual cache.put.

export interface EpochGuard {
  plugin: SerwistPlugin;
  /** Call before deleting the private caches. */
  bump(): void;
}

const EPOCH = "epoch";

export function createEpochGuard(storage: () => CacheStorage): EpochGuard {
  let epoch = 0;

  const plugin: SerwistPlugin = {
    handlerWillStart: ({ state }) => {
      if (state) {
        state[EPOCH] = epoch;
      }
      return Promise.resolve();
    },
    // Defining cacheWillUpdate replaces the strategy's built-in "only cache
    // 200s" check (Serwist adds it only when no plugin has this callback), so
    // that check is repeated here, plus one more: a response that was
    // redirected is refused too. Measured on a production build: right after
    // sign-out the Stuff screen re-prefetches its item links, the proxy sends
    // each one to /sign-in, and the fetch follows the redirect to a 200 —
    // which would otherwise be stored under the item's URL.
    cacheWillUpdate: ({ response, state }) => {
      if (response.status !== 200 || response.redirected) {
        return null;
      }
      return state?.[EPOCH] === epoch ? response : null;
    },
    cacheDidUpdate: async ({ cacheName, request, state }) => {
      if (state?.[EPOCH] !== epoch) {
        const cache = await storage().open(cacheName);
        await cache.delete(request);
      }
    },
  };

  return {
    plugin,
    bump() {
      epoch += 1;
    },
  };
}
