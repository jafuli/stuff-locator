import { describe, expect, test, vi } from "vitest";
import { EmbeddingClient } from "@/lib/search/embedding-client";
import { FakeEmbeddingWorker } from "./fake-embedding-worker";

function setup(options: { connection?: { saveData?: boolean; effectiveType?: string } } = {}) {
  const worker = new FakeEmbeddingWorker((text) => [text.length, 1]);
  const createWorker = vi.fn(() => worker);
  const client = new EmbeddingClient({ createWorker, connectionSource: { connection: options.connection } });
  return { worker, createWorker, client };
}

describe("lazy start", () => {
  test("constructing the client builds no worker and starts no download", () => {
    const { createWorker, client } = setup();
    expect(createWorker).not.toHaveBeenCalled();
    expect(client.getStatus()).toBe("idle");
  });

  test("start() builds the worker once and asks it to load the model", () => {
    const { worker, createWorker, client } = setup();
    client.start();
    client.start();
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.received).toEqual([{ type: "init" }]);
    expect(client.getStatus()).toBe("loading");
  });

  test("becomes ready when the worker says so, and tells subscribers", () => {
    const { worker, client } = setup();
    const listener = vi.fn();
    client.subscribe(listener);
    client.start();
    worker.ready();
    expect(client.getStatus()).toBe("ready");
    expect(listener).toHaveBeenCalled();
  });

  test("reports download progress while loading", () => {
    const { worker, client } = setup();
    client.start();
    worker.emit({ type: "progress", loaded: 5, total: 20 });
    expect(client.getProgress()).toEqual({ loaded: 5, total: 20 });
  });
});

describe("connection awareness", () => {
  test.each([
    ["Save-Data", { saveData: true }],
    ["2g", { effectiveType: "2g" }],
    ["slow-2g", { effectiveType: "slow-2g" }],
  ])("%s: is skipped and never builds a worker", (_label, connection) => {
    const { createWorker, client } = setup({ connection });
    client.start();
    expect(client.getStatus()).toBe("skipped");
    expect(createWorker).not.toHaveBeenCalled();
  });

  test("a browser without navigator.connection still starts", () => {
    const { createWorker, client } = setup({ connection: undefined });
    client.start();
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(client.getStatus()).toBe("loading");
  });

  test("a skipped client stays skipped and embed() rejects so callers fall back", async () => {
    const { client } = setup({ connection: { saveData: true } });
    client.start();
    client.start();
    expect(client.getStatus()).toBe("skipped");
    await expect(client.embed(["x"])).rejects.toThrow(/not ready/);
  });
});

describe("failure falls back, permanently", () => {
  test("a worker that can't be constructed ends in failed without throwing", () => {
    const client = new EmbeddingClient({
      createWorker: () => {
        throw new Error("blocked by CSP");
      },
      connectionSource: {},
    });
    expect(() => {
      client.start();
    }).not.toThrow();
    expect(client.getStatus()).toBe("failed");
  });

  test("a model load error from the worker ends in failed and stops the worker", () => {
    const { worker, client } = setup();
    client.start();
    worker.emit({ type: "error", message: "fetch failed" });
    expect(client.getStatus()).toBe("failed");
    expect(worker.terminated).toBe(true);
  });

  test("a crashing worker ends in failed", () => {
    const { worker, client } = setup();
    client.start();
    worker.crash();
    expect(client.getStatus()).toBe("failed");
  });

  test("a crash rejects every embed still in flight", async () => {
    const { worker, client } = setup();
    client.start();
    worker.ready();
    const pending = client.embed(["a"]);
    worker.crash();
    await expect(pending).rejects.toThrow();
  });

  test("a failed client does not retry on a later start()", () => {
    const { worker, createWorker, client } = setup();
    client.start();
    worker.emit({ type: "error", message: "nope" });
    client.start();
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(client.getStatus()).toBe("failed");
  });

  test("a per-request error rejects only that request and leaves the client ready", async () => {
    const { worker, client } = setup();
    client.start();
    worker.ready();
    const first = client.embed(["a"]);
    const request = worker.embedRequests.at(0);
    worker.emit({ type: "error", requestId: request?.requestId, message: "bad input" });
    await expect(first).rejects.toThrow("bad input");
    expect(client.getStatus()).toBe("ready");
  });
});

describe("embed()", () => {
  test("rejects before the model is ready", async () => {
    const { client } = setup();
    await expect(client.embed(["a"])).rejects.toThrow(/not ready/);
    client.start();
    await expect(client.embed(["a"])).rejects.toThrow(/not ready/);
  });

  test("resolves with the vectors for exactly the request that asked", async () => {
    const { worker, client } = setup();
    client.start();
    worker.ready();
    const pending = client.embed(["abc"]);
    worker.answer(0);
    const vector = (await pending).at(0);
    expect(Array.from(vector ?? [])).toEqual([3, 1]);
  });

  test("answers are matched by request id even when they arrive out of order", async () => {
    const { worker, client } = setup();
    client.start();
    worker.ready();
    const first = client.embed(["a"]);
    const second = client.embed(["bb"]);
    worker.answer(1);
    worker.answer(0);
    expect(Array.from((await first).at(0) ?? [])).toEqual([1, 1]);
    expect(Array.from((await second).at(0) ?? [])).toEqual([2, 1]);
  });

  test("a reply for a request nobody is waiting for is dropped", () => {
    const { worker, client } = setup();
    client.start();
    worker.ready();
    expect(() => {
      worker.emit({ type: "result", requestId: 999, vectors: [] });
    }).not.toThrow();
    expect(client.getStatus()).toBe("ready");
  });
});
