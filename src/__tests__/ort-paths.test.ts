import { describe, expect, test } from "vitest";
import { isSafariBelow26, ortWasmPaths } from "@/lib/search/ort-paths";

const SAFARI_18 =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15";
const SAFARI_26 =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0 Mobile/15E148 Safari/604.1";
const CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

describe("isSafariBelow26 (replicating transformers.js)", () => {
  test("Safari 18 is below 26; Safari 26 is not", () => {
    expect(isSafariBelow26({ userAgent: SAFARI_18, vendor: "Apple Computer, Inc." })).toBe(true);
    expect(isSafariBelow26({ userAgent: SAFARI_26, vendor: "Apple Computer, Inc." })).toBe(false);
  });

  test("other browsers on Apple platforms are not Safari", () => {
    expect(isSafariBelow26({ userAgent: IOS_CHROME, vendor: "Apple Computer, Inc." })).toBe(false);
    expect(isSafariBelow26({ userAgent: CHROME, vendor: "Google Inc." })).toBe(false);
  });

  test("without navigator.vendor (as in a worker) nothing counts as Safari", () => {
    expect(isSafariBelow26({ userAgent: SAFARI_18 })).toBe(false);
  });
});

describe("ortWasmPaths", () => {
  test("the asyncify build, same-origin and versioned, by default", () => {
    expect(ortWasmPaths("1.31.0", { userAgent: CHROME, vendor: "Google Inc." })).toEqual({
      mjs: "/ort/1.31.0/ort-wasm-simd-threaded.asyncify.mjs",
      wasm: "/ort/1.31.0/ort-wasm-simd-threaded.asyncify.wasm",
    });
  });

  test("the plain build for Safari < 26 without WebGPU", () => {
    expect(ortWasmPaths("1.31.0", { userAgent: SAFARI_18, vendor: "Apple Computer, Inc." })).toEqual({
      mjs: "/ort/1.31.0/ort-wasm-simd-threaded.mjs",
      wasm: "/ort/1.31.0/ort-wasm-simd-threaded.wasm",
    });
  });

  test("Safari < 26 with WebGPU keeps asyncify", () => {
    expect(ortWasmPaths("1.31.0", { userAgent: SAFARI_18, vendor: "Apple Computer, Inc.", gpu: {} }).wasm).toBe(
      "/ort/1.31.0/ort-wasm-simd-threaded.asyncify.wasm",
    );
  });
});
