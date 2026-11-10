"use client";

import { useEffect } from "react";
import { shouldPrefetch, type ConnectionSource } from "./connection";
import type { EmbeddingClient } from "./embedding-client";
import { isModelCached } from "./model-cache";
import { getSharedEmbeddingClient } from "./shared-client";

export interface IdlePrefetchOptions {
  /** False skips the warm-up entirely (e.g. a household with nothing to search). Defaults to true. */
  enabled?: boolean;
  /** Defaults to the global navigator. */
  connectionSource?: ConnectionSource;
  /** Defaults to the real Cache API check. */
  checkCached?: () => Promise<boolean>;
}

type CancelIdle = () => void;

/**
 * Run `callback` once the browser is idle. Safari has no requestIdleCallback,
 * so it falls back to a macrotask, which still lets the first paint and
 * hydration finish first.
 */
function onIdle(callback: () => void): CancelIdle {
  // Both looked up together, so a browser with one has the other to cancel with.
  const request =
    typeof window.requestIdleCallback === "function" ? window.requestIdleCallback.bind(window) : undefined;
  const cancel = typeof window.cancelIdleCallback === "function" ? window.cancelIdleCallback.bind(window) : undefined;
  if (request && cancel) {
    const handle = request(callback);
    return () => {
      cancel(handle);
    };
  }
  const handle = window.setTimeout(callback, 1);
  return () => {
    window.clearTimeout(handle);
  };
}

/**
 * Warm the embedding model in the background once the Stuff screen is idle,
 * when that is free (weights already cached) or cheap (a 4g connection). See
 * shouldPrefetch for the rule. Otherwise it does nothing, and focus or a
 * keystroke still starts the model as before.
 *
 * Only an "idle" client is started: a failed or skipped one is left alone, so
 * remounting the screen never turns into a retry (retrying is reserved for a
 * real search intent).
 */
export function useIdlePrefetch(
  client: EmbeddingClient = getSharedEmbeddingClient(),
  { enabled = true, connectionSource, checkCached = isModelCached }: IdlePrefetchOptions = {},
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    const source = connectionSource ?? (typeof navigator === "undefined" ? undefined : (navigator as ConnectionSource));
    const cancelIdle = onIdle(() => {
      if (client.getStatus() !== "idle") {
        return;
      }
      void checkCached()
        .catch(() => false)
        .then((cached) => {
          if (cancelled || client.getStatus() !== "idle") {
            return;
          }
          if (shouldPrefetch(source, { cached })) {
            client.start();
          }
        });
    });
    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [enabled, client, connectionSource, checkCached]);
}
