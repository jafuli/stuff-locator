import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ConnectionSource } from "@/lib/search/connection";
import { EmbeddingClient } from "@/lib/search/embedding-client";
import { useIdlePrefetch } from "@/lib/search/use-idle-prefetch";
import { FakeEmbeddingWorker } from "./fake-embedding-worker";

// jsdom has no requestIdleCallback, so by default the hook uses its setTimeout
// fallback (the Safari path). One test installs a fake requestIdleCallback.

function setup(connection: ConnectionSource["connection"]) {
  const worker = new FakeEmbeddingWorker();
  const createWorker = vi.fn(() => worker);
  const connectionSource: ConnectionSource = { connection };
  const client = new EmbeddingClient({ createWorker, connectionSource });
  return { worker, createWorker, client, connectionSource };
}

const notCached = () => Promise.resolve(false);
const cached = () => Promise.resolve(true);

async function flushIdle(): Promise<void> {
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("when it starts the model on idle", () => {
  test("a 4g connection: starts once the browser is idle, not during render", async () => {
    const { client, createWorker, connectionSource } = setup({ effectiveType: "4g" });
    renderHook(() => {
      useIdlePrefetch(client, { connectionSource, checkCached: notCached });
    });
    expect(createWorker).not.toHaveBeenCalled();

    await flushIdle();
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(client.getStatus()).toBe("loading");
  });

  test("a cached model: starts even where the connection alone wouldn't justify it", async () => {
    for (const connection of [{ effectiveType: "3g" }, undefined]) {
      const { client, connectionSource } = setup(connection);
      const { unmount } = renderHook(() => {
        useIdlePrefetch(client, { connectionSource, checkCached: cached });
      });
      await flushIdle();
      expect(client.getStatus()).toBe("loading");
      unmount();
    }
  });

  test("uses requestIdleCallback where the browser has it", async () => {
    const callbacks: (() => void)[] = [];
    vi.stubGlobal(
      "requestIdleCallback",
      vi.fn((callback: () => void) => {
        callbacks.push(callback);
        return 7;
      }),
    );
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    const { client, connectionSource } = setup({ effectiveType: "4g" });
    renderHook(() => {
      useIdlePrefetch(client, { connectionSource, checkCached: notCached });
    });

    await flushIdle();
    expect(client.getStatus()).toBe("idle");

    await act(async () => {
      callbacks.forEach((callback) => {
        callback();
      });
      await vi.runAllTimersAsync();
    });
    expect(client.getStatus()).toBe("loading");
  });
});

describe("when it waits for a search intent instead", () => {
  test.each([
    ["3g", { effectiveType: "3g" }],
    ["no Network Information API", undefined],
  ])("%s, model not cached: nothing starts", async (_label, connection) => {
    const { client, createWorker, connectionSource } = setup(connection);
    renderHook(() => {
      useIdlePrefetch(client, { connectionSource, checkCached: notCached });
    });
    await flushIdle();
    expect(createWorker).not.toHaveBeenCalled();
    expect(client.getStatus()).toBe("idle");

    // Focus/keystroke (the component calls onIntent -> start) still works.
    client.start();
    expect(client.getStatus()).toBe("loading");
  });

  test("Save-Data: nothing starts, even with the model cached", async () => {
    const { client, createWorker, connectionSource } = setup({ effectiveType: "4g", saveData: true });
    renderHook(() => {
      useIdlePrefetch(client, { connectionSource, checkCached: cached });
    });
    await flushIdle();
    expect(createWorker).not.toHaveBeenCalled();
    expect(client.getStatus()).toBe("idle");
  });

  test("disabled (nothing to search): nothing starts", async () => {
    const { client, createWorker, connectionSource } = setup({ effectiveType: "4g" });
    renderHook(() => {
      useIdlePrefetch(client, { enabled: false, connectionSource, checkCached: cached });
    });
    await flushIdle();
    expect(createWorker).not.toHaveBeenCalled();
  });

  test("a client that already failed is not restarted by a remount", async () => {
    const { client, worker, createWorker, connectionSource } = setup({ effectiveType: "4g" });
    client.start();
    worker.crash();
    expect(client.getStatus()).toBe("failed");

    renderHook(() => {
      useIdlePrefetch(client, { connectionSource, checkCached: cached });
    });
    await flushIdle();
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(client.getStatus()).toBe("failed");
  });
});

describe("unmounting", () => {
  test("before idle: the idle callback is cancelled and nothing starts", async () => {
    const { client, createWorker, connectionSource } = setup({ effectiveType: "4g" });
    const { unmount } = renderHook(() => {
      useIdlePrefetch(client, { connectionSource, checkCached: notCached });
    });
    unmount();
    await flushIdle();
    expect(createWorker).not.toHaveBeenCalled();
  });

  test("while the cache check is still pending: its answer is ignored", async () => {
    let resolveCached: (value: boolean) => void = () => undefined;
    const slowCheck = () =>
      new Promise<boolean>((resolve) => {
        resolveCached = resolve;
      });
    const { client, createWorker, connectionSource } = setup({ effectiveType: "4g" });
    const { unmount } = renderHook(() => {
      useIdlePrefetch(client, { connectionSource, checkCached: slowCheck });
    });
    await flushIdle();
    unmount();
    await act(async () => {
      resolveCached(true);
      await vi.runAllTimersAsync();
    });
    expect(createWorker).not.toHaveBeenCalled();
  });
});
