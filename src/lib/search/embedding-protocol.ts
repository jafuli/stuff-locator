// The messages between the main thread and the embedding worker. Plain
// structured-cloneable data only; vectors travel as Float32Arrays.

/** Hugging Face model id. all-MiniLM-L6-v2: ~23 MB quantised, ~6 ms per embedding (see ADR 0012). */
export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

export type WorkerRequest = { type: "init" } | { type: "embed"; requestId: number; texts: string[] };

export type WorkerResponse =
  | { type: "ready" }
  | { type: "progress"; loaded: number; total: number }
  | { type: "result"; requestId: number; vectors: Float32Array[] }
  | { type: "error"; requestId?: number; message: string };
