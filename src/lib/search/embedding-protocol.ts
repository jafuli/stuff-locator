// The messages between the main thread and the embedding worker. Plain
// structured-cloneable data only; vectors travel as Float32Arrays.

/** Hugging Face model id. all-MiniLM-L6-v2: ~23 MB quantised, ~6 ms per embedding (see ADR 0012). */
export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

/**
 * The exact commit of MODEL_ID on the Hub. Pinned so the weights can't change
 * under a release because upstream `main` moved. It also keys transformers.js's
 * cache, the vector memo and the "is it cached?" check. To bump it, use
 * `curl -s https://huggingface.co/api/models/Xenova/all-MiniLM-L6-v2 | jq -r .sha`.
 */
export const MODEL_REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";

/** The ONNX weights file transformers.js loads for dtype "q8" (the `_quantized` suffix). */
export const MODEL_WEIGHTS_FILE = "onnx/model_quantized.onnx";

export type WorkerRequest = { type: "init" } | { type: "embed"; requestId: number; texts: string[] };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; requestId: number; vectors: Float32Array[] }
  | { type: "error"; requestId?: number; message: string };
