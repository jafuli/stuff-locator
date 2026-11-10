/// <reference lib="webworker" />
import { MODEL_ID, type WorkerRequest, type WorkerResponse } from "./embedding-protocol";

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
    // the browser Cache API; nothing is looked up under this app's own origin.
    env.allowLocalModels = false;

    // Per-file progress folded into one running total.
    const files = new Map<string, { loaded: number; total: number }>();
    const extractor = await pipeline("feature-extraction", MODEL_ID, {
      // Pinned: the ~23 MB quantised weights the spike measured, not whatever
      // the library's default dtype becomes in a later release.
      dtype: "q8",
      progress_callback: (info: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (info.status !== "progress" || info.file === undefined) {
          return;
        }
        files.set(info.file, { loaded: info.loaded ?? 0, total: info.total ?? 0 });
        let loaded = 0;
        let total = 0;
        for (const file of files.values()) {
          loaded += file.loaded;
          total += file.total;
        }
        post({ type: "progress", loaded, total });
      },
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
