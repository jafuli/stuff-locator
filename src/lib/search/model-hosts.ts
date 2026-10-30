// Where the embedding model's files come from. Kept apart from the service
// worker so the check is unit-testable; src/app/sw.ts imports it by relative
// path (the service worker is bundled by esbuild, outside the "@/" alias).
//
// transformers.js stores these files itself, in the Cache API under
// "transformers-cache". Serwist's default cross-origin rule would store the
// same responses a second time, so the service worker is told to leave them
// alone.

/** Hugging Face Hub and its CDN: config, tokenizer and the ~23 MB ONNX weights. */
function isHuggingFaceHost(hostname: string): boolean {
  return (
    hostname === "huggingface.co" ||
    hostname.endsWith(".huggingface.co") ||
    hostname === "hf.co" ||
    hostname.endsWith(".hf.co")
  );
}

/**
 * onnxruntime-web's wasm runtime, which transformers.js fetches from jsDelivr
 * by default. jsDelivr is a general CDN, so only that one package counts.
 */
function isOnnxRuntimeAsset(url: URL): boolean {
  return url.hostname === "cdn.jsdelivr.net" && url.pathname.startsWith("/npm/onnxruntime-web@");
}

export function isModelRequest(url: URL): boolean {
  return isHuggingFaceHost(url.hostname) || isOnnxRuntimeAsset(url);
}
