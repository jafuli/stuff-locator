/// <reference lib="webworker" />
import { MODEL_ID, MODEL_REVISION, type WorkerRequest, type WorkerResponse } from "./embedding-protocol";
import { ortWasmPaths } from "./ort-paths";

// Runs off the main thread so loading the model and embedding the corpus never
// blocks typing. transformers.js is imported dynamically, inside init, so that
// merely constructing the worker costs nothing and the package's weight is a
// separate chunk fetched only once someone actually starts a search.

declare const self: DedicatedWorkerGlobalScope;

type Extractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor> | undefined;

function post(message: WorkerResponse, transfer: Transferable[] = []): void {
  self.postMessage(message, transfer);
}

function loadExtractor(): Promise<Extractor> {
  extractorPromise ??= (async () => {
    const { env, pipeline } = await import("@huggingface/transformers");
    // Weights come from the Hugging Face Hub and are kept by transformers.js in
    // the browser Cache API; no model is looked up under this app's own origin.
    env.allowLocalModels = false;

    // Pin the Hub path itself, not only the `revision` option. transformers.js
    // 4.3.2 has code paths that build Hub URLs without passing `revision`, so
    // they default to `main`: pipeline()'s file discovery, and
    // AutoTokenizer's probe for tokenizer_config.json, on every load. With the
    // commit in the template, every URL it builds names the pinned commit.
    // Those probes then find their answer in the Cache API, where the pinned
    // files are stored under exactly these URLs, instead of going to the
    // network: no unpinned request, and no network needed to start a cached model.
    env.remotePathTemplate = `{model}/resolve/${MODEL_REVISION}/`;

    // The wasm runtime does come from this origin (public/ort/<version>/, see
    // scripts/copy-ort.mjs), not jsDelivr. The library set its own paths when
    // it was imported; they're read only when a session is created, so
    // replacing them here, before the model loads, is what takes effect.
    // useWasmCache stays on: transformers.js keeps these files in the Cache API too.
    const onnx = env.backends.onnx;
    const version = onnx.versions?.web;
    if (version === undefined || onnx.wasm === undefined) {
      throw new Error("onnxruntime-web did not report its version; can't locate its wasm runtime");
    }
    onnx.wasm.wasmPaths = ortWasmPaths(version, self.navigator);

    // No progress_callback: nothing in the UI shows download progress, and
    // passing one adds a metadata request per file before the load.
    const extractor = await pipeline("feature-extraction", MODEL_ID, {
      // The same commit as the template above. Also used by the cache check
      // and the vector memo keys (embedding-protocol.ts).
      revision: MODEL_REVISION,
      // Pinned: the ~23 MB quantised weights the spike measured
      // (onnx/model_quantized.onnx), not whatever the library's default dtype
      // becomes in a later release.
      dtype: "q8",
    });
    return extractor;
  })();
  return extractorPromise;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  if (request.type === "init") {
    loadExtractor().then(
      () => {
        post({ type: "ready" });
      },
      (error: unknown) => {
        // Don't cache a failed load: a later init may be a retry.
        extractorPromise = undefined;
        post({ type: "error", message: messageOf(error) });
      },
    );
    return;
  }

  loadExtractor()
    .then((extractor) => extractor(request.texts, { pooling: "mean", normalize: true }))
    .then(
      (output) => {
        const vectors = output.tolist().map((row) => Float32Array.from(row));
        post(
          { type: "result", requestId: request.requestId, vectors },
          vectors.map((vector) => vector.buffer),
        );
      },
      (error: unknown) => {
        post({ type: "error", requestId: request.requestId, message: messageOf(error) });
      },
    );
});
