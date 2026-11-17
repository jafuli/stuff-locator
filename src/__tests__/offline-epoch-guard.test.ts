import { expect, test, vi } from "vitest";
import type { MapLikeObject } from "serwist";
import { createEpochGuard } from "@/lib/offline/epoch-guard";

const req = new Request("https://stuff.example/items/1");
const event = new Event("fetch") as ExtendableEvent;

function fakeStorage() {
  const deleteEntry = vi.fn().mockResolvedValue(true);
  const open = vi.fn().mockResolvedValue({ delete: deleteEntry });
  const storage = { open } as unknown as CacheStorage;
  return { storage, open, deleteEntry };
}

async function start(guard: ReturnType<typeof createEpochGuard>): Promise<MapLikeObject> {
  const state: MapLikeObject = {};
  await guard.plugin.handlerWillStart?.({ request: req, event, state });
  return state;
}

test("a response is cached when no clear happened while it was in flight", async () => {
  const guard = createEpochGuard(() => fakeStorage().storage);
  const state = await start(guard);
  const response = new Response("page", { status: 200 });

  expect(await guard.plugin.cacheWillUpdate?.({ request: req, response, event, state })).toBe(response);
});

test("a response that started before a clear is never written back", async () => {
  const guard = createEpochGuard(() => fakeStorage().storage);
  const state = await start(guard);
  guard.bump();

  const response = new Response("previous user's page", { status: 200 });
  expect(await guard.plugin.cacheWillUpdate?.({ request: req, response, event, state })).toBeNull();
});

test("a request that starts after the clear caches normally", async () => {
  const guard = createEpochGuard(() => fakeStorage().storage);
  guard.bump();
  const state = await start(guard);
  const response = new Response("page", { status: 200 });

  expect(await guard.plugin.cacheWillUpdate?.({ request: req, response, event, state })).toBe(response);
});

test.each([307, 404, 500])("a %i response is never cached (the strategy's own 200-only rule, kept)", async (status) => {
  const guard = createEpochGuard(() => fakeStorage().storage);
  const state = await start(guard);
  const response = new Response(null, { status });

  expect(await guard.plugin.cacheWillUpdate?.({ request: req, response, event, state })).toBeNull();
});

test("a redirected response is never cached (a signed-out prefetch followed to /sign-in)", async () => {
  const guard = createEpochGuard(() => fakeStorage().storage);
  const state = await start(guard);
  const response = new Response("sign-in page", { status: 200 });
  Object.defineProperty(response, "redirected", { value: true });

  expect(await guard.plugin.cacheWillUpdate?.({ request: req, response, event, state })).toBeNull();
});

test("a write that slipped in after a clear is deleted again", async () => {
  const { storage, open, deleteEntry } = fakeStorage();
  const guard = createEpochGuard(() => storage);
  const state = await start(guard);
  guard.bump();

  await guard.plugin.cacheDidUpdate?.({
    cacheName: "pages-rsc",
    request: req,
    newResponse: new Response("page"),
    event,
    state,
  });

  expect(open).toHaveBeenCalledWith("pages-rsc");
  expect(deleteEntry).toHaveBeenCalledWith(req);
});

test("a current write is left alone", async () => {
  const { storage, open } = fakeStorage();
  const guard = createEpochGuard(() => storage);
  const state = await start(guard);

  await guard.plugin.cacheDidUpdate?.({
    cacheName: "pages-rsc",
    request: req,
    newResponse: new Response("page"),
    event,
    state,
  });

  expect(open).not.toHaveBeenCalled();
});
