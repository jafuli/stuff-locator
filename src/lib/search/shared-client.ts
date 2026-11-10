import { EmbeddingClient } from "./embedding-client";

// One client for the page's lifetime: the model is expensive to start, and
// navigating Home -> Browse -> Home shouldn't throw it away (nor, since the
// client also memoises vectors, the embeddings). Created on first use, never
// at import time; constructing it does nothing until start().
let sharedClient: EmbeddingClient | undefined;

export function getSharedEmbeddingClient(): EmbeddingClient {
  sharedClient ??= new EmbeddingClient();
  return sharedClient;
}
