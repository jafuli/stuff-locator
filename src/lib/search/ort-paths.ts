// Where the embedding worker loads onnxruntime-web's wasm runtime from: this
// app's own origin, under /ort/<version>/ (copied there by
// scripts/copy-ort.mjs), instead of transformers.js's default, jsDelivr.
//
// Setting env.backends.onnx.wasm.wasmPaths overrides the library's own
// choice entirely, so the choice is replicated here from transformers.js
// 4.3.2 (src/backends/onnx.js and isSafariBelow26 in src/env.js): the asyncify
// build, except in Safari < 26 without WebGPU, which gets the plain build.
// Note that WorkerNavigator has no `vendor`, so inside a worker this check
// (like the library's own) treats every browser as "not Safari" and picks
// asyncify. Replicating it keeps us on exactly what upstream would load.

/** Where scripts/copy-ort.mjs puts the files, under public/. */
export const ORT_PUBLIC_PATH = "/ort";

export interface NavigatorLike {
  userAgent: string;
  vendor?: string;
  gpu?: unknown;
}

/** transformers.js's isSafariBelow26, against a passed-in navigator. */
export function isSafariBelow26(nav: NavigatorLike): boolean {
  const userAgent = nav.userAgent;
  const isSafari =
    (nav.vendor ?? "").includes("Apple") &&
    !/CriOS|FxiOS|EdgiOS|OPiOS|mercury|brave/i.test(userAgent) &&
    !userAgent.includes("Chrome") &&
    !userAgent.includes("Android");
  if (!isSafari) {
    return false;
  }
  // A missing or unparseable version is treated as a modern Safari.
  const match = /Version\/(\d+)/.exec(userAgent);
  return match?.[1] !== undefined ? Number.parseInt(match[1], 10) < 26 : false;
}

/** The same-origin { mjs, wasm } pair for this onnxruntime-web version and browser. */
export function ortWasmPaths(version: string, nav: NavigatorLike): { mjs: string; wasm: string } {
  const plain = isSafariBelow26(nav) && !("gpu" in nav);
  const stem = `${ORT_PUBLIC_PATH}/${version}/ort-wasm-simd-threaded${plain ? "" : ".asyncify"}`;
  return { mjs: `${stem}.mjs`, wasm: `${stem}.wasm` };
}
