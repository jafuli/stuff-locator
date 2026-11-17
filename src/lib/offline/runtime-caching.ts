import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  StaleWhileRevalidate,
  type RuntimeCaching,
  type SerwistPlugin,
} from "serwist";
import type { PrivateCacheName } from "./cache-policy";

// The service worker's runtime caching, declared here instead of using
// Serwist's `defaultCache`, so every cache name the worker writes is one this
// repo owns and the private ones are exactly the ones the sign-out clearing
// deletes (src/lib/offline/cache-policy.ts). See docs/adr/0014.
//
// Two groups:
//
// - Static assets (fonts, images, JS, CSS): no household data, kept across
//   sign-out. Rules, names and limits are copied from Serwist's defaultCache.
//   Its audio/video, Google Fonts (next/font self-hosts), /_next/data (Pages
//   Router only) and .json/.xml/.csv rules are dropped: nothing here uses them.
//
// - Pages: rendered HTML, RSC payloads and RSC prefetches, which do carry
//   household data. NetworkFirst, so they're only read from cache when the
//   network fails — that is what keeps a dropped connection mid-session
//   usable. Each carries the epoch guard so an in-flight request can't
//   refill a cache that was just cleared.
//
// Never cached: /api/* (the only route is a POST) and every cross-origin
// request — Supabase REST and Auth included. The browser's own Supabase reads
// are the household menu and onboarding, both useless offline (nothing can be
// written), and an auth response must never be served from cache.

export const STATIC_CACHE_NAMES = [
  "static-font-assets",
  "static-image-assets",
  "next-static-js-assets",
  "next-image",
  "static-js-assets",
  "static-style-assets",
] as const;

type StaticCacheName = (typeof STATIC_CACHE_NAMES)[number];

const DAY = 24 * 60 * 60;

function expiration(maxEntries: number, maxAgeSeconds: number): ExpirationPlugin {
  return new ExpirationPlugin({ maxEntries, maxAgeSeconds, maxAgeFrom: "last-used" });
}

function staticRule(matcher: RegExp, cacheName: StaticCacheName, maxEntries: number, maxAgeSeconds: number) {
  return {
    matcher,
    handler: new StaleWhileRevalidate({ cacheName, plugins: [expiration(maxEntries, maxAgeSeconds)] }),
  } satisfies RuntimeCaching;
}

function pagesStrategy(cacheName: PrivateCacheName, guard: SerwistPlugin): NetworkFirst {
  return new NetworkFirst({
    cacheName,
    plugins: [guard, new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: DAY })],
  });
}

function isRsc(request: Request): boolean {
  return request.headers.get("RSC") === "1";
}

function isPrefetch(request: Request): boolean {
  return request.headers.get("Next-Router-Prefetch") === "1";
}

export interface RuntimeCachingOptions {
  /** Serwist's own rule: cache nothing outside a production build. */
  production: boolean;
  /** The epoch guard's plugin (src/lib/offline/epoch-guard.ts). */
  privateCacheGuard: SerwistPlugin;
}

export function createRuntimeCaching({ production, privateCacheGuard }: RuntimeCachingOptions): RuntimeCaching[] {
  if (!production) {
    return [{ matcher: /.*/i, handler: new NetworkOnly() }];
  }

  return [
    // Never cached. First, so nothing below can claim these requests.
    { matcher: ({ sameOrigin }) => !sameOrigin, handler: new NetworkOnly() },
    { matcher: ({ url: { pathname } }) => pathname.startsWith("/api/"), handler: new NetworkOnly() },

    // Static assets.
    staticRule(/\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i, "static-font-assets", 4, 7 * DAY),
    staticRule(/\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i, "static-image-assets", 64, 30 * DAY),
    {
      matcher: /\/_next\/static.+\.js$/i,
      handler: new CacheFirst({ cacheName: "next-static-js-assets", plugins: [expiration(64, DAY)] }),
    },
    staticRule(/\/_next\/image\?url=.+$/i, "next-image", 64, DAY),
    staticRule(/\.(?:js)$/i, "static-js-assets", 48, DAY),
    staticRule(/\.(?:css|less)$/i, "static-style-assets", 32, DAY),

    // Pages: household data.
    {
      matcher: ({ request }) => isRsc(request) && isPrefetch(request),
      handler: pagesStrategy("pages-rsc-prefetch", privateCacheGuard),
    },
    { matcher: ({ request }) => isRsc(request), handler: pagesStrategy("pages-rsc", privateCacheGuard) },
    // Documents, and anything else same-origin (the web manifest). Two writers
    // share this cache and must keep sharing it: a navigation, and
    // SerwistProvider's cacheOnNavigation, which re-fetches the URL of every
    // client-side navigation as a plain request so the page can later load
    // offline as a document. Serwist's own "pages" rule matched on the
    // request's Content-Type header, which neither sends, so documents always
    // lived here; a separate navigation rule would write them to one cache and
    // read them from another. "pages" stays on the clear list for old installs.
    { matcher: () => true, handler: pagesStrategy("others", privateCacheGuard) },
  ];
}
