// Which requests belong to the embedding model. Kept apart from the service
// worker so the check is unit-testable; src/app/sw.ts imports it by relative
// path (the service worker is bundled by esbuild, outside the "@/" alias).
//
// transformers.js stores all of these itself, in the Cache API under
// "transformers-cache": the model files and (with useWasmCache) the wasm
// runtime. If the service worker also cached them, there'd be a second copy of
// ~23 MB of weights and ~40 MB of wasm, so it's told to leave them alone.

/** onnxruntime-web's wasm runtime, self-hosted under public/ort/ (scripts/copy-ort.mjs). */
export const ORT_PATH_PREFIX = "/ort/";

/** Hugging Face Hub and its CDN: config, tokenizer and the ~23 MB ONNX weights. */
export function isHuggingFaceRequest(url: URL): boolean {
  const { hostname } = url;
  return (
    hostname === "huggingface.co" ||
    hostname.endsWith(".huggingface.co") ||
    hostname === "hf.co" ||
    hostname.endsWith(".hf.co")
  );
}

/** Model files from Hugging Face, or the wasm runtime on this app's own origin. */
export function isModelRequest(url: URL, appOrigin: string): boolean {
  return isHuggingFaceRequest(url) || (url.origin === appOrigin && url.pathname.startsWith(ORT_PATH_PREFIX));
}
