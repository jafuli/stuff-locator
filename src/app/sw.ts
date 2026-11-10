/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
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

// Turbopack hands a Web Worker its bootstrap config in the worker URL's
// fragment (`worker.js#params=...`). A fetch is never sent with its fragment,
// and a response produced by this service worker (Serwist's CacheFirst rule
// for /_next/static/*.js, or a precache hit) has a fragment-less URL, which
// the browser then adopts as the worker's own location, so the worker boots
// with no config and dies with "Missing worker bootstrap config". Worker
// entry requests therefore must not be answered here: registered before
// Serwist's own listener, this stops the event reaching it, so the request
// goes to the network (and the HTTP cache) with its fragment intact. The
// worker's own chunks load via importScripts without a fragment and are still
// cached normally.
self.addEventListener("fetch", (event) => {
  if (event.request.destination === "worker") {
    event.stopImmediatePropagation();
  }
});

serwist.addEventListeners();
