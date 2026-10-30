/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";
import { isModelRequest } from "../lib/search/model-hosts";

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
// 2. The embedding model (~23 MB) and its wasm runtime. transformers.js keeps
//    them in the Cache API itself; Serwist's default cross-origin NetworkFirst
//    rule would store a second copy of every response. They are also never in
//    the precache. See docs/adr/0012-client-side-embedding-search.md.
self.addEventListener("fetch", (event) => {
  if (event.request.destination === "worker" || isModelRequest(new URL(event.request.url))) {
    event.stopImmediatePropagation();
  }
});

serwist.addEventListeners();
