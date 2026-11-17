/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import { deletePrivateCaches, isClearPrivateCachesMessage } from "../lib/offline/cache-policy";
import { createEpochGuard } from "../lib/offline/epoch-guard";
import { createRuntimeCaching } from "../lib/offline/runtime-caching";
import { isModelRequest } from "../lib/search/model-hosts";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Runtime caching is declared in this repo rather than taken from Serwist's
// defaultCache, so the caches holding household data have names we own and
// clear. See src/lib/offline/runtime-caching.ts and docs/adr/0014.
const privateCacheGuard = createEpochGuard(() => self.caches);

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: createRuntimeCaching({
    production: process.env.NODE_ENV === "production",
    privateCacheGuard: privateCacheGuard.plugin,
  }),
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

// Two kinds of request are deliberately left unanswered here. Registered
// before Serwist's own listener, stopImmediatePropagation() keeps the event
// from ever reaching Serwist, and a fetch event nobody calls respondWith() on
// is simply performed by the browser as if there were no service worker.
//
// 1. Worker entry scripts. Turbopack hands a Web Worker its bootstrap config in
//    the URL's fragment (`worker.js#params=...`). A fetch is never sent with its
//    fragment, and a response produced by this service worker (Serwist's
//    CacheFirst rule for /_next/static/*.js, or a precache hit) has a
//    fragment-less URL, which the browser then adopts as the worker's own
//    location, so the worker boots with no config and dies with "Missing worker
//    bootstrap config". The worker's own chunks load via importScripts without a
//    fragment and are still cached normally.
// 2. The embedding model (~23 MB, Hugging Face) and its wasm runtime (/ort/ on
//    this origin). transformers.js keeps both in the Cache API itself;
//    Serwist's runtime rules would store a second copy of every response.
//    /ort/ is also kept out of the precache (src/app/serwist/[path]/route.ts).
//    See docs/adr/0012-client-side-embedding-search.md.
self.addEventListener("fetch", (event) => {
  if (event.request.destination === "worker" || isModelRequest(new URL(event.request.url), self.location.origin)) {
    event.stopImmediatePropagation();
  }
});

// Sign-out, or a different user signing in, asks for the private caches to be
// emptied (src/lib/offline/clear-private-caches.ts). The epoch is bumped
// before deleting, so a request already in flight can't write its response
// back into a cache that was just cleared. The reply tells the page it may
// navigate on; the page doesn't wait long for it.
self.addEventListener("message", (event) => {
  if (!isClearPrivateCachesMessage(event.data)) {
    return;
  }
  privateCacheGuard.bump();
  // `at` rather than `[0]`: a message posted without a port has none.
  const port = event.ports.at(0);
  event.waitUntil(
    deletePrivateCaches(self.caches).then(
      () => {
        port?.postMessage({ ok: true });
      },
      () => {
        port?.postMessage({ ok: false });
      },
    ),
  );
});

serwist.addEventListeners();
