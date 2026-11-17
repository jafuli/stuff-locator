import { CLEAR_PRIVATE_CACHES, deletePrivateCaches, type ClearPrivateCachesMessage } from "@/lib/offline/cache-policy";

/** How long sign-out waits for the service worker's reply before moving on. */
export const SERVICE_WORKER_REPLY_TIMEOUT_MS = 1500;

/**
 * Empties every runtime cache that can hold household data
 * (src/lib/offline/cache-policy.ts). Never rejects and never waits longer than
 * the timeout: a missing service worker, a missing Cache API (some private
 * modes) or a worker that doesn't answer must not stand between a person and
 * signing out.
 *
 * Two routes, both taken:
 * - Ask the controlling service worker, which bumps its epoch first, so a
 *   request already in flight can't write back into the emptied cache.
 * - Delete from the page too, which covers a page no worker controls yet
 *   (first load, hard reload) and a worker still on an older version.
 */
export async function clearPrivateCaches(timeoutMs = SERVICE_WORKER_REPLY_TIMEOUT_MS): Promise<void> {
  await Promise.allSettled([askServiceWorker(timeoutMs), deleteFromPage()]);
}

async function deleteFromPage(): Promise<void> {
  if (typeof caches === "undefined") {
    return;
  }
  await deletePrivateCaches(caches);
}

function askServiceWorker(timeoutMs: number): Promise<void> {
  // `in`, because navigator.serviceWorker is missing outside a secure
  // context even though the DOM types say it's always there.
  const controller =
    typeof navigator !== "undefined" && "serviceWorker" in navigator ? navigator.serviceWorker.controller : null;
  if (controller === null || typeof MessageChannel === "undefined") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(done, timeoutMs);
    function done() {
      clearTimeout(timer);
      channel.port1.close();
      resolve();
    }
    channel.port1.onmessage = done;
    try {
      const message: ClearPrivateCachesMessage = { type: CLEAR_PRIVATE_CACHES };
      controller.postMessage(message, [channel.port2]);
    } catch {
      done();
    }
  });
}
