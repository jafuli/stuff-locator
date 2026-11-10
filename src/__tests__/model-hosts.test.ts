import { describe, expect, test } from "vitest";
import { isHuggingFaceRequest, isModelRequest } from "@/lib/search/model-hosts";

const APP = "https://stuff.example";
const isModel = (url: string) => isModelRequest(new URL(url), APP);

describe("isModelRequest", () => {
  test("matches the Hugging Face Hub and its CDN hosts", () => {
    expect(isModel("https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/abc/onnx/model_quantized.onnx")).toBe(true);
    expect(isModel("https://us.aws.cdn.hf.co/xet-bridge-us/abc/def")).toBe(true);
    expect(isModel("https://cdn-lfs.huggingface.co/repos/x")).toBe(true);
    expect(isModel("https://hf.co/Xenova/all-MiniLM-L6-v2")).toBe(true);
  });

  test("matches the self-hosted wasm runtime under /ort/ on the app's own origin", () => {
    expect(isModel(`${APP}/ort/1.31.0/ort-wasm-simd-threaded.asyncify.wasm`)).toBe(true);
    expect(isModel(`${APP}/ort/1.31.0/ort-wasm-simd-threaded.mjs`)).toBe(true);
  });

  test("does not match /ort/ on another origin, or app paths that merely look similar", () => {
    expect(isModel("https://elsewhere.example/ort/1.31.0/ort-wasm-simd-threaded.wasm")).toBe(false);
    expect(isModel(`${APP}/ortho/x`)).toBe(false);
    expect(isModel(`${APP}/items/ort/1`)).toBe(false);
  });

  test("no longer treats jsDelivr as a model host", () => {
    expect(
      isModel("https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0/dist/ort-wasm-simd-threaded.asyncify.wasm"),
    ).toBe(false);
  });

  test("does not match look-alike hosts", () => {
    expect(isModel("https://nothuggingface.co/model.onnx")).toBe(false);
    expect(isModel("https://huggingface.co.evil.example/model.onnx")).toBe(false);
    expect(isModel("https://evilhf.co/x")).toBe(false);
  });

  test("does not match the app's own pages and chunks, or Supabase", () => {
    expect(isModel(`${APP}/_next/static/chunks/a.js`)).toBe(false);
    expect(isModel("https://abc.supabase.co/rest/v1/items")).toBe(false);
  });
});

describe("isHuggingFaceRequest", () => {
  test("is only the third-party half (what e2e routes)", () => {
    expect(isHuggingFaceRequest(new URL("https://huggingface.co/x"))).toBe(true);
    expect(isHuggingFaceRequest(new URL(`${APP}/ort/1.31.0/x.wasm`))).toBe(false);
  });
});
