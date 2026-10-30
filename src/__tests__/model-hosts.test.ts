import { describe, expect, test } from "vitest";
import { isModelRequest } from "@/lib/search/model-hosts";

const matches = (url: string) => isModelRequest(new URL(url));

describe("isModelRequest", () => {
  test("matches the Hugging Face Hub and its CDN hosts", () => {
    expect(matches("https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx")).toBe(true);
    expect(matches("https://us.aws.cdn.hf.co/xet-bridge-us/abc/def")).toBe(true);
    expect(matches("https://cdn-lfs.huggingface.co/repos/x")).toBe(true);
    expect(matches("https://hf.co/Xenova/all-MiniLM-L6-v2")).toBe(true);
  });

  test("matches onnxruntime-web's wasm runtime on jsDelivr", () => {
    expect(
      matches("https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0/dist/ort-wasm-simd-threaded.asyncify.wasm"),
    ).toBe(true);
  });

  test("does not swallow other jsDelivr packages", () => {
    expect(matches("https://cdn.jsdelivr.net/npm/some-other-lib@1.0.0/dist/index.js")).toBe(false);
  });

  test("does not match look-alike hosts", () => {
    expect(matches("https://nothuggingface.co/model.onnx")).toBe(false);
    expect(matches("https://huggingface.co.evil.example/model.onnx")).toBe(false);
    expect(matches("https://evilhf.co/x")).toBe(false);
  });

  test("does not match the app's own origin or Supabase", () => {
    expect(matches("http://localhost:3000/_next/static/chunks/a.js")).toBe(false);
    expect(matches("https://abc.supabase.co/rest/v1/items")).toBe(false);
  });
});
