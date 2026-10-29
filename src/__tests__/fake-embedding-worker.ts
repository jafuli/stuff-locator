import type { WorkerLike } from "@/lib/search/embedding-client";
import type { WorkerRequest, WorkerResponse } from "@/lib/search/embedding-protocol";

/**
 * A stand-in for the embedding worker that lets a test decide, step by step,
 * when the model becomes ready and when each embed request is answered. The
 * real EmbeddingClient runs on top of it, so the tests cover the client's
 * actual request bookkeeping rather than a mock of it.
 */
export class FakeEmbeddingWorker implements WorkerLike {
  onmessage: WorkerLike["onmessage"] = null;
  onerror: WorkerLike["onerror"] = null;
  onmessageerror: WorkerLike["onmessageerror"] = null;

  readonly received: WorkerRequest[] = [];
  terminated = false;

  /** text -> vector. Anything not listed embeds to the zero vector. */
  constructor(private readonly vectorFor: (text: string) => number[] = () => [0, 0]) {}

  postMessage(message: WorkerRequest): void {
    this.received.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Embed requests received so far, oldest first. */
  get embedRequests(): Extract<WorkerRequest, { type: "embed" }>[] {
    return this.received.filter((m): m is Extract<WorkerRequest, { type: "embed" }> => m.type === "embed");
  }

  emit(message: WorkerResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<WorkerResponse>);
  }

  ready(): void {
    this.emit({ type: "ready" });
  }

  /** Answer one embed request (by position in embedRequests) with this fake's vectors. */
  answer(index: number): void {
    const request = this.embedRequests.at(index);
    if (!request) {
      throw new Error(`no embed request #${index.toString()}`);
    }
    this.emit({
      type: "result",
      requestId: request.requestId,
      vectors: request.texts.map((text) => Float32Array.from(this.vectorFor(text))),
    });
  }

  crash(): void {
    this.onerror?.({} as ErrorEvent);
  }
}
