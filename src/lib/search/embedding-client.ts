import { shouldAutoDownload, type ConnectionSource } from "./connection";
import type { WorkerRequest, WorkerResponse } from "./embedding-protocol";

/**
 * idle    - nothing started; Find is the substring filter.
 * skipped - connection says don't download (Save-Data, 2g); stays the substring filter.
 * loading - worker is fetching / initialising the model; substring filter serves meanwhile.
 * ready   - embeddings available.
 * failed  - the model or worker broke; the substring filter is permanent for this page load.
 */
export type EmbeddingStatus = "idle" | "skipped" | "loading" | "ready" | "failed";

/** The slice of Worker the client uses, so tests can hand in a fake. */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
}

export interface EmbeddingClientOptions {
  /** Defaults to constructing the real module worker. Only called from start(). */
  createWorker?: () => WorkerLike;
  /** Defaults to the global navigator. */
  connectionSource?: ConnectionSource;
}

export interface Progress {
  loaded: number;
  total: number;
}

function createDefaultWorker(): WorkerLike {
  return new Worker(new URL("./embedding.worker.ts", import.meta.url));
}

/**
 * Main-thread handle on the embedding worker. Lazy: constructing a client does
 * nothing, and the worker (and so the model download) only exists after
 * start(). Never throws to callers: any failure ends in status "failed" and
 * every pending embed() rejects, so the UI can always fall back.
 */
export class EmbeddingClient {
  private status: EmbeddingStatus = "idle";
  private worker: WorkerLike | undefined;
  private nextRequestId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (vectors: Float32Array[]) => void; reject: (error: Error) => void }
  >();
  private readonly statusListeners = new Set<() => void>();
  private progress: Progress | undefined;
  private readonly createWorker: () => WorkerLike;
  private readonly connectionSource: ConnectionSource | undefined;

  constructor(options: EmbeddingClientOptions = {}) {
    this.createWorker = options.createWorker ?? createDefaultWorker;
    this.connectionSource =
      options.connectionSource ?? (typeof navigator === "undefined" ? undefined : (navigator as ConnectionSource));
  }

  getStatus(): EmbeddingStatus {
    return this.status;
  }

  getProgress(): Progress | undefined {
    return this.progress;
  }

  /** useSyncExternalStore-compatible. */
  subscribe = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  };

  /** Begin loading the model. Idempotent; a no-op once started, skipped or failed. */
  start(): void {
    if (this.status !== "idle") {
      return;
    }
    if (!shouldAutoDownload(this.connectionSource)) {
      this.setStatus("skipped");
      return;
    }

    let worker: WorkerLike;
    try {
      worker = this.createWorker();
    } catch {
      this.fail(new Error("embedding worker could not be created"));
      return;
    }
    this.worker = worker;
    worker.onmessage = (event) => {
      this.handle(event.data);
    };
    worker.onerror = () => {
      this.fail(new Error("embedding worker crashed"));
    };
    worker.onmessageerror = () => {
      this.fail(new Error("embedding worker sent an unreadable message"));
    };
    this.setStatus("loading");
    worker.postMessage({ type: "init" });
  }

  /**
   * Embed texts in order. Resolves with one vector per text. Rejects if the
   * model isn't ready or the worker fails; callers treat a rejection as "use
   * the substring filter". Starting is the caller's job (start()).
   */
  embed(texts: string[]): Promise<Float32Array[]> {
    const worker = this.worker;
    if (this.status !== "ready" || !worker) {
      return Promise.reject(new Error(`embedding model is not ready (${this.status})`));
    }
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      worker.postMessage({ type: "embed", requestId, texts });
    });
  }

  /** Tear down the worker and reject anything in flight. */
  dispose(): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.rejectAll(new Error("embedding client disposed"));
    this.statusListeners.clear();
  }

  private handle(message: WorkerResponse): void {
    switch (message.type) {
      case "ready":
        if (this.status === "loading") {
          this.setStatus("ready");
        }
        return;
      case "progress":
        this.progress = { loaded: message.loaded, total: message.total };
        this.notify();
        return;
      case "result": {
        // A reply for a request that was already rejected or never existed is
        // dropped: an old answer must never resolve a newer question.
        const entry = this.pending.get(message.requestId);
        if (entry) {
          this.pending.delete(message.requestId);
          entry.resolve(message.vectors);
        }
        return;
      }
      case "error": {
        if (message.requestId !== undefined) {
          const entry = this.pending.get(message.requestId);
          if (entry) {
            this.pending.delete(message.requestId);
            entry.reject(new Error(message.message));
          }
          return;
        }
        this.fail(new Error(message.message));
      }
    }
  }

  private fail(error: Error): void {
    this.worker?.terminate();
    this.worker = undefined;
    this.rejectAll(error);
    this.setStatus("failed");
  }

  private rejectAll(error: Error): void {
    for (const entry of this.pending.values()) {
      entry.reject(error);
    }
    this.pending.clear();
  }

  private setStatus(status: EmbeddingStatus): void {
    this.status = status;
    this.notify();
  }

  private notify(): void {
    for (const listener of this.statusListeners) {
      listener();
    }
  }
}
