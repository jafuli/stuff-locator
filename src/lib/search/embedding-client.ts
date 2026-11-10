import { shouldAutoDownload, type ConnectionSource } from "./connection";
import { MODEL_ID, MODEL_REVISION, type WorkerRequest, type WorkerResponse } from "./embedding-protocol";

/**
 * How many vectors the memo keeps. A household is ~20-50 items, two strings
 * each, plus the queries typed this session; 2,000 is generous for that and
 * costs ~3 MB at most (384 floats * 4 bytes each). Past it, the least recently
 * used vector is dropped and is simply re-embedded if it is needed again.
 */
export const VECTOR_MEMO_LIMIT = 2000;

/** The memo key: model and revision, so vectors from a different model can never be mixed in. */
export function vectorMemoKey(text: string): string {
  return `${MODEL_ID}@${MODEL_REVISION}\u0000${text}`;
}

/**
 * idle    - nothing started; Find is the lexical ranking.
 * skipped - connection says don't download (Save-Data, 2g); stays the lexical ranking.
 * loading - worker is fetching / initialising the model; the lexical ranking serves meanwhile.
 * ready   - embeddings available.
 * failed  - the model or worker broke; the lexical ranking serves (see start() for the one retry).
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
  /**
   * Called once, the first time the model is ready. Defaults to asking the
   * browser to keep this origin's storage (navigator.storage.persist()), so
   * the ~23 MB of cached weights are less likely to be evicted under storage
   * pressure. The answer is ignored: a refusal just means best-effort storage,
   * which is what we had anyway.
   */
  persistStorage?: () => unknown;
}

export interface Progress {
  loaded: number;
  total: number;
}

function requestPersistentStorage(): void {
  // Typed as always present, but missing in older browsers and insecure contexts.
  if (
    typeof navigator === "undefined" ||
    !("storage" in navigator) ||
    typeof navigator.storage.persist !== "function"
  ) {
    return;
  }
  navigator.storage.persist().catch(() => {
    // Ignored: persistence is a hint, not a requirement.
  });
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
  private readonly persistStorage: () => unknown;
  /** text -> vector, least recently used first (a Map keeps insertion order). In memory only. */
  private readonly memo = new Map<string, Float32Array>();
  /** Texts already sent to the worker and not yet answered, so a second ask waits instead of re-sending. */
  private readonly inFlight = new Map<string, Promise<Float32Array>>();
  private persistRequested = false;

  constructor(options: EmbeddingClientOptions = {}) {
    this.createWorker = options.createWorker ?? createDefaultWorker;
    this.persistStorage = options.persistStorage ?? requestPersistentStorage;
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
   * the lexical ranking". Starting is the caller's job (start()).
   *
   * Memoised: only texts this client has never embedded (and isn't already
   * embedding) go to the worker, as one batch. So re-rendering, remounting
   * the Stuff screen or deleting an item costs nothing; stashing or editing
   * costs the changed strings; a move or place rename costs the affected
   * items' enriched strings. Nothing is persisted: a reload starts empty.
   */
  embed(texts: string[]): Promise<Float32Array[]> {
    const worker = this.worker;
    if (this.status !== "ready" || !worker) {
      return Promise.reject(new Error(`embedding model is not ready (${this.status})`));
    }

    const missing = [...new Set(texts)].filter((text) => {
      const key = vectorMemoKey(text);
      return !this.memo.has(key) && !this.inFlight.has(key);
    });
    if (missing.length > 0) {
      const batch = this.send(worker, missing);
      missing.forEach((text, index) => {
        const key = vectorMemoKey(text);
        const vector = batch.then((vectors) => {
          const value = vectors.at(index);
          if (value === undefined) {
            throw new Error("embedding worker returned too few vectors");
          }
          this.remember(key, value);
          return value;
        });
        this.inFlight.set(key, vector);
        // Settled either way, it stops being in flight. A failure isn't
        // remembered: the next ask (e.g. after a retry) sends it again.
        const settle = () => {
          this.inFlight.delete(key);
        };
        vector.then(settle, settle);
      });
    }

    return Promise.all(
      texts.map((text) => {
        const key = vectorMemoKey(text);
        const hit = this.recall(key);
        if (hit) {
          return Promise.resolve(hit);
        }
        return this.inFlight.get(key) ?? Promise.reject(new Error("embedding request was lost"));
      }),
    );
  }

  private send(worker: WorkerLike, texts: string[]): Promise<Float32Array[]> {
    const requestId = this.nextRequestId++;
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      worker.postMessage({ type: "embed", requestId, texts });
    });
  }

  /** A memoised vector, marked most recently used. */
  private recall(key: string): Float32Array | undefined {
    const hit = this.memo.get(key);
    if (hit) {
      this.memo.delete(key);
      this.memo.set(key, hit);
    }
    return hit;
  }

  private remember(key: string, vector: Float32Array): void {
    this.memo.delete(key);
    this.memo.set(key, vector);
    while (this.memo.size > VECTOR_MEMO_LIMIT) {
      const oldest = this.memo.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.memo.delete(oldest.value);
    }
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
          this.requestPersistenceOnce();
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

  private requestPersistenceOnce(): void {
    if (this.persistRequested) {
      return;
    }
    this.persistRequested = true;
    try {
      this.persistStorage();
    } catch {
      // A hint only; never let it break the ready transition.
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
