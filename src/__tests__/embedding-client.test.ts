import { describe, expect, test, vi } from "vitest";
import { EmbeddingClient, VECTOR_MEMO_LIMIT, vectorMemoKey } from "@/lib/search/embedding-client";
import { MODEL_ID, MODEL_REVISION } from "@/lib/search/embedding-protocol";
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

describe("persistent storage", () => {
  test("asks for it once, the first time the model is ready, and never before", () => {
    const persistStorage = vi.fn();
    const worker = new FakeEmbeddingWorker();
    const client = new EmbeddingClient({ createWorker: () => worker, connectionSource: {}, persistStorage });
    client.start();
    expect(persistStorage).not.toHaveBeenCalled();
    worker.ready();
    worker.ready();
    expect(persistStorage).toHaveBeenCalledTimes(1);
  });

  test("a persist() that throws doesn't stop the model from being ready", () => {
    const worker = new FakeEmbeddingWorker();
    const client = new EmbeddingClient({
      createWorker: () => worker,
      connectionSource: {},
      persistStorage: () => {
        throw new Error("not allowed");
      },
    });
    client.start();
    worker.ready();
    expect(client.getStatus()).toBe("ready");
  });
});

describe("vector memo", () => {
  function ready() {
    const { worker, client } = setup();
    client.start();
    worker.ready();
    return { worker, client };
  }

  test("sends only the texts it hasn't embedded yet, as one batch, and keeps the caller's order", async () => {
    const { worker, client } = ready();
    const first = client.embed(["a", "bb"]);
    worker.answer(0);
    await first;

    const second = client.embed(["ccc", "a", "dddd", "bb"]);
    expect(worker.embedRequests[1]?.texts).toEqual(["ccc", "dddd"]);
    worker.answer(1);
    const vectors = await second;
    expect(vectors.map((v) => Array.from(v))).toEqual([
      [3, 1],
      [1, 1],
      [4, 1],
      [2, 1],
    ]);
  });

  test("all hits: answers without a worker round-trip", async () => {
    const { worker, client } = ready();
    const first = client.embed(["a"]);
    worker.answer(0);
    await first;
    await expect(client.embed(["a", "a"])).resolves.toHaveLength(2);
    expect(worker.embedRequests).toHaveLength(1);
  });

  test("a text repeated in one call, or already in flight, is sent once", async () => {
    const { worker, client } = ready();
    const first = client.embed(["a", "a"]);
    const second = client.embed(["a", "b"]);
    expect(worker.embedRequests.map((r) => r.texts)).toEqual([["a"], ["b"]]);
    worker.answer(0);
    worker.answer(1);
    expect((await first).map((v) => Array.from(v))).toEqual([
      [1, 1],
      [1, 1],
    ]);
    expect((await second).map((v) => Array.from(v))).toEqual([
      [1, 1],
      [1, 1],
    ]);
  });

  test("a failed batch isn't remembered: asking again sends it again", async () => {
    const { worker, client } = ready();
    const first = client.embed(["a"]);
    const request = worker.embedRequests.at(0);
    worker.emit({ type: "error", requestId: request?.requestId ?? -1, message: "oom" });
    await expect(first).rejects.toThrow("oom");

    const second = client.embed(["a"]);
    expect(worker.embedRequests).toHaveLength(2);
    worker.answer(1);
    await expect(second).resolves.toHaveLength(1);
  });

  test(`keeps at most ${VECTOR_MEMO_LIMIT.toString()} vectors, dropping the least recently used`, async () => {
    const { worker, client } = ready();
    const texts = Array.from({ length: VECTOR_MEMO_LIMIT }, (_, i) => `t${i.toString()}`);
    const fill = client.embed(texts);
    worker.answer(0);
    await fill;

    // Touch t0 so t1 is now the oldest, then push one more in.
    await client.embed(["t0"]);
    const extra = client.embed(["new"]);
    worker.answer(1);
    await extra;

    const again = client.embed(["t0", "t1", "t2"]);
    expect(worker.embedRequests[2]?.texts).toEqual(["t1"]);
    worker.answer(2);
    await again;
  });

  test("keys include the model and its pinned revision", () => {
    expect(vectorMemoKey("passport")).toBe(`${MODEL_ID}@${MODEL_REVISION}\u0000passport`);
  });
});
