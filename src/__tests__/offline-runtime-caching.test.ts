import { describe, expect, test } from "vitest";
import { NetworkOnly, Strategy, type RuntimeCaching, type SerwistPlugin } from "serwist";
import { PRIVATE_CACHE_NAMES } from "@/lib/offline/cache-policy";
import { createRuntimeCaching, STATIC_CACHE_NAMES } from "@/lib/offline/runtime-caching";

const ORIGIN = "https://stuff.example";
const guard: SerwistPlugin = {};
const rules = createRuntimeCaching({ production: true, privateCacheGuard: guard });

interface FakeRequestInit {
  headers?: Record<string, string>;
  mode?: RequestMode;
}

// A real Request can't be constructed with mode "navigate", so the mode is
// overridden on the instance; everything else is the real thing.
function request(url: string, { headers = {}, mode }: FakeRequestInit = {}): Request {
  const req = new Request(url, { headers });
  if (mode !== undefined) {
    Object.defineProperty(req, "mode", { value: mode });
  }
  return req;
}

// The first rule that claims the request, the way Serwist's router picks one.
function ruleFor(req: Request): RuntimeCaching {
  const url = new URL(req.url);
  const sameOrigin = url.origin === ORIGIN;
  const rule = rules.find(({ matcher, method = "GET" }) => {
    if (method !== req.method) {
      return false;
    }
    if (matcher instanceof RegExp) {
      return matcher.test(url.href);
    }
    if (typeof matcher === "function") {
      return Boolean(matcher({ url, request: req, sameOrigin, event: new Event("fetch") as ExtendableEvent }));
    }
    return false;
  });
  if (!rule) {
    throw new Error(`no rule for ${req.url}`);
  }
  return rule;
}

function cacheNameFor(req: Request): string {
  const { handler } = ruleFor(req);
  if (handler instanceof NetworkOnly) {
    return "network-only";
  }
  if (handler instanceof Strategy) {
    return handler.cacheName;
  }
  throw new Error("expected a Strategy handler");
}

describe("which cache a request lands in", () => {
  test.each([
    [
      "an RSC prefetch",
      request(`${ORIGIN}/items/1?_rsc=a`, { headers: { RSC: "1", "Next-Router-Prefetch": "1" } }),
      "pages-rsc-prefetch",
    ],
    ["an RSC navigation", request(`${ORIGIN}/items/1?_rsc=b`, { headers: { RSC: "1" } }), "pages-rsc"],
    ["a document navigation", request(`${ORIGIN}/browse`, { mode: "navigate" }), "others"],
    // SerwistProvider's cacheOnNavigation re-fetch: a plain request, same cache.
    ["a cache-on-navigation re-fetch", request(`${ORIGIN}/browse`), "others"],
    ["the web manifest", request(`${ORIGIN}/manifest.webmanifest`), "others"],
    ["a Next static chunk", request(`${ORIGIN}/_next/static/chunks/app.js`), "next-static-js-assets"],
    ["a stylesheet", request(`${ORIGIN}/_next/static/css/app.css`), "static-style-assets"],
    ["an icon", request(`${ORIGIN}/icons/icon-192.png`), "static-image-assets"],
    ["a font", request(`${ORIGIN}/_next/static/media/font.woff2`), "static-font-assets"],
  ])("%s → %s", (_label, req, expected) => {
    expect(cacheNameFor(req)).toBe(expected);
  });

  test.each([
    ["Supabase REST", "https://abc.supabase.co/rest/v1/household_members?select=*"],
    ["Supabase Auth", "https://abc.supabase.co/auth/v1/user"],
    ["any other origin", "https://cdn.example/lib.js"],
    ["a same-origin API GET", `${ORIGIN}/api/household/bootstrap`],
  ])("%s is never cached", (_label, url) => {
    expect(cacheNameFor(request(url, { headers: { RSC: "1" } }))).toBe("network-only");
  });

  test("outside a production build nothing is cached", () => {
    const devRules = createRuntimeCaching({ production: false, privateCacheGuard: guard });
    expect(devRules).toHaveLength(1);
    expect(devRules[0]?.handler).toBeInstanceOf(NetworkOnly);
  });
});

describe("every cache the worker writes is either cleared on sign-out or holds no household data", () => {
  const written = rules.flatMap(({ handler }) =>
    handler instanceof Strategy && !(handler instanceof NetworkOnly) ? [handler.cacheName] : [],
  );
  const known = new Set<string>([...PRIVATE_CACHE_NAMES, ...STATIC_CACHE_NAMES]);

  test("no cache name falls outside the two lists", () => {
    // A new rule with a new cache name fails here until it's added to one
    // list or the other — so a household-data cache can't be added without
    // also being cleared.
    expect(written.filter((name) => !known.has(name))).toEqual([]);
  });

  test("every page cache carries the epoch guard", () => {
    for (const { handler } of rules) {
      if (handler instanceof Strategy && (PRIVATE_CACHE_NAMES as readonly string[]).includes(handler.cacheName)) {
        expect(handler.plugins).toContain(guard);
      }
    }
  });
});
