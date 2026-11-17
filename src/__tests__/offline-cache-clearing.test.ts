import { afterEach, describe, expect, test, vi } from "vitest";
import { CLEAR_PRIVATE_CACHES, PRIVATE_CACHE_NAMES } from "@/lib/offline/cache-policy";
import { decideCacheClear } from "@/lib/offline/cache-clear-decision";
import { clearPrivateCaches } from "@/lib/offline/clear-private-caches";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("decideCacheClear", () => {
  test("no session clears and forgets the last user", () => {
    expect(decideCacheClear(null, "user-a")).toEqual({ clear: true, nextUserId: null });
  });

  test("the same user again keeps the caches", () => {
    expect(decideCacheClear("user-a", "user-a")).toEqual({ clear: false, nextUserId: "user-a" });
  });

  test("a different user clears", () => {
    expect(decideCacheClear("user-b", "user-a")).toEqual({ clear: true, nextUserId: "user-b" });
  });

  test("an unknown last user clears (first visit, or storage blocked)", () => {
    expect(decideCacheClear("user-a", null)).toEqual({ clear: true, nextUserId: "user-a" });
  });
});

function stubCaches(deleteImpl: (name: string) => Promise<boolean> = () => Promise.resolve(true)) {
  const cacheStorage = { delete: vi.fn(deleteImpl) };
  vi.stubGlobal("caches", cacheStorage);
  return cacheStorage;
}

function stubController(onMessage: (message: unknown, port: MessagePort | undefined) => void) {
  const controller = {
    postMessage: vi.fn((message: unknown, transfer: MessagePort[]) => {
      onMessage(message, transfer[0]);
    }),
  };
  vi.stubGlobal("navigator", { serviceWorker: { controller } });
  return controller;
}

describe("clearPrivateCaches", () => {
  test("deletes every private cache from the page", async () => {
    const cacheStorage = stubCaches();
    vi.stubGlobal("navigator", { serviceWorker: { controller: null } });

    await clearPrivateCaches();

    expect(cacheStorage.delete.mock.calls.map(([name]) => name)).toEqual([...PRIVATE_CACHE_NAMES]);
  });

  test("resolves with no Cache API and no service worker", async () => {
    vi.stubGlobal("caches", undefined);
    vi.stubGlobal("navigator", {});

    await expect(clearPrivateCaches()).resolves.toBeUndefined();
  });

  test("resolves even when deleting throws", async () => {
    stubCaches(() => Promise.reject(new Error("SecurityError")));
    vi.stubGlobal("navigator", { serviceWorker: { controller: null } });

    await expect(clearPrivateCaches()).resolves.toBeUndefined();
  });

  test("asks the controlling service worker and waits for its reply", async () => {
    stubCaches();
    const controller = stubController((_message, port) => {
      port?.postMessage({ ok: true });
    });

    await clearPrivateCaches();

    expect(controller.postMessage).toHaveBeenCalledWith({ type: CLEAR_PRIVATE_CACHES }, expect.any(Array));
  });

  test("stops waiting for a service worker that never replies", async () => {
    vi.useFakeTimers();
    stubCaches();
    stubController(() => {
      // never answers
    });

    const done = vi.fn();
    void clearPrivateCaches(1500).then(done);
    await vi.advanceTimersByTimeAsync(1499);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalled();
  });

  test("resolves when posting to the service worker throws", async () => {
    stubCaches();
    stubController(() => {
      throw new Error("DataCloneError");
    });

    await expect(clearPrivateCaches()).resolves.toBeUndefined();
  });
});
