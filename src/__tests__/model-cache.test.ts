import { describe, expect, test, vi } from "vitest";
import { MODEL_ID, MODEL_REVISION } from "@/lib/search/embedding-protocol";
import {
  isModelCached,
  modelWeightsUrl,
  TRANSFORMERS_CACHE_NAME,
  type CacheStorageLike,
} from "@/lib/search/model-cache";

function storageWith(keys: string[], cacheExists = true) {
  const open = vi.fn(() =>
    Promise.resolve({
      match: (request: string) => Promise.resolve(keys.includes(request) ? new Response("weights") : undefined),
    }),
  );
  const storage: CacheStorageLike = {
    has: (name: string) => Promise.resolve(cacheExists && name === TRANSFORMERS_CACHE_NAME),
    open,
  };
  return { storage, open };
}

describe("modelWeightsUrl", () => {
  test("is transformers.js's cache key for the pinned q8 weights", () => {
    expect(modelWeightsUrl()).toBe(
      `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}/onnx/model_quantized.onnx`,
    );
  });
});

describe("isModelCached", () => {
  test("true when the pinned weights are in transformers-cache", async () => {
    await expect(isModelCached(storageWith([modelWeightsUrl()]).storage)).resolves.toBe(true);
  });

  test("false when the cache exists but holds something else (e.g. weights for an older revision)", async () => {
    const older = `https://huggingface.co/${MODEL_ID}/resolve/main/onnx/model_quantized.onnx`;
    await expect(isModelCached(storageWith([older]).storage)).resolves.toBe(false);
  });

  test("false without opening anything when the cache doesn't exist, so checking never creates it", async () => {
    const { storage, open } = storageWith([], false);
    await expect(isModelCached(storage)).resolves.toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  test("false when there is no Cache API at all", async () => {
    await expect(isModelCached(undefined)).resolves.toBe(false);
  });

  test("false, not a throw, when the Cache API errors", async () => {
    const hasThrows: CacheStorageLike = {
      has: () => Promise.reject(new DOMException("SecurityError")),
      open: () => Promise.reject(new Error("unreachable")),
    };
    const openThrows: CacheStorageLike = {
      has: () => Promise.resolve(true),
      open: () => Promise.reject(new DOMException("SecurityError")),
    };
    await expect(isModelCached(hasThrows)).resolves.toBe(false);
    await expect(isModelCached(openThrows)).resolves.toBe(false);
  });
});
